import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkProvider } from './WorkProvider.js';

vi.mock('nano-pow-with-fallback', () => {
  class MockPowService {
    public ready = Promise.resolve();
    public backend = 'wasm';
    public readonly disabledBackends: string[];

    constructor(options?: { disabledBackends?: string[] }) {
      this.disabledBackends = options?.disabledBackends ?? [];
      if (!this.disabledBackends.includes('webgpu')) this.backend = 'webgpu';
      else if (!this.disabledBackends.includes('webgl')) this.backend = 'webgl';
      else this.backend = 'wasm';
    }

    async getProofOfWork(): Promise<{ backend: string; proofOfWork: string }> {
      const delays: Record<string, number> = { webgpu: 1, webgl: 3, wasm: 5 };
      await new Promise((resolve) => setTimeout(resolve, delays[this.backend] ?? 1));
      return { backend: this.backend, proofOfWork: '1111111111111111' };
    }

    cancel(): void {}
  }

  return {
    PowBackendName: {
      WEBGPU: 'webgpu',
      WEBGL: 'webgl',
      WASM: 'wasm',
    },
    PowService: MockPowService,
  };
});

describe('WorkProvider orchestration', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to local work generation when remote work fails', async () => {
    fetchMock.mockRejectedValue(new Error('remote unavailable'));

    const provider = WorkProvider.auto({ urls: ['https://work.example.com'] });
    const work = await provider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffffff800000000');

    expect(work).toBe('1111111111111111');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({ mode: 'local', backend: 'webgpu' });
  });

  it('uses local work generation when no remote work pool is configured', async () => {
    const provider = WorkProvider.auto({});
    const work = await provider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffffff800000000');

    expect(work).toBe('1111111111111111');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({ mode: 'local', backend: 'webgpu' });
  });

  it('runs work probing as a single-flight async operation', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ node_vendor: 'nano' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const provider = WorkProvider.auto({
      urls: ['https://work.example.com'],
      profiler: { mode: 'auto', preferLocalAboveMhs: 0, cacheStrategy: 'memory' },
    });

    const [planA, planB] = await Promise.all([provider.probe(), provider.probe()]);

    expect(planA).toEqual(planB);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(provider.getAuditReport().executionPlan.source).toBe('probe');
  });

  it('builds a probed plan with local-first then remote fallback', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ node_vendor: 'nano' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const provider = WorkProvider.auto({
      urls: ['https://work.example.com'],
      profiler: { mode: 'auto', preferLocalAboveMhs: 0, cacheStrategy: 'memory' },
    });

    const plan = await provider.probe();

    expect(plan.steps[0]?.kind).toBe('webgpu');
    expect(plan.steps[1]?.kind).toBe('remote');
  });

  it('exercises calibration through the probe path without asserting hardware specifics', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ node_vendor: 'nano' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const provider = WorkProvider.auto({
      urls: ['https://work.example.com'],
      profiler: { mode: 'auto', preferLocalAboveMhs: 0, cacheStrategy: 'memory' },
    });

    const profile = await provider.calibrate();

    expect(profile.activeStrategy).toBe('planned');
    expect(profile.measuredMhs).toBeGreaterThanOrEqual(0);
    expect(provider.getAuditReport().executionPlan.source).toBe('probe');
  });
});
