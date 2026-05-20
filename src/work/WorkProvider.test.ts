import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkProvider } from './WorkProvider.js';
import { WorkType, generateWork } from 'nano-rspow-node';
vi.mock('nano-rspow-node', () => ({
  WorkType: { Send: 'Send', Receive: 'Receive', Epoch1: 'Epoch1', Dev: 'Dev' },
  generateWork: vi.fn(async () => '1111111111111111'),
  validateWork: vi.fn(() => true),
}));

describe('WorkProvider orchestration', () => {
  beforeEach(() => {
    vi.mocked(generateWork).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates work locally', async () => {
    const provider = WorkProvider.auto();
    const work = await provider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffffff800000000');

    expect(work).toBe('1111111111111111');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({ mode: 'local', backend: 'nano-rspow-node' });
  });

  it('runs work probing as a single-flight async operation', async () => {
    const provider = WorkProvider.auto({
      profiler: { mode: 'auto', cacheStrategy: 'memory' },
    });

    const [planA, planB] = await Promise.all([provider.probe(), provider.probe()]);

    expect(planA).toEqual(planB);
    expect(planA.source).toBe('probe');
  });

  it('probe produces a local-only plan', async () => {
    const provider = WorkProvider.auto({
      profiler: { mode: 'auto', cacheStrategy: 'memory' },
    });

    const plan = await provider.probe();

    expect(plan.steps).toEqual([{ kind: 'local' }]);
  });

  it('exercises calibration through the probe path', async () => {
    const provider = WorkProvider.auto({
      profiler: { mode: 'auto', cacheStrategy: 'memory' },
    });

    const profile = await provider.calibrate();

    expect(profile.activeStrategy).toBe('planned');
    expect(profile.measuredMhs).toBeGreaterThanOrEqual(0);
    expect(provider.getAuditReport().executionPlan.source).toBe('probe');
  });

  it('cacheStrategy memory keeps probe result across multiple probes', async () => {
    const provider = WorkProvider.auto({
      profiler: { mode: 'auto', cacheStrategy: 'memory' },
    });

    await provider.probe();
    const plan1 = await provider.probe();
    const plan2 = await provider.probe();

    expect(plan1).toEqual(plan2);
    expect(vi.mocked(generateWork)).toHaveBeenCalledTimes(1);
  });

  it('maps difficulty thresholds to nano-rspow-node WorkType values', async () => {
    const provider = WorkProvider.auto();
    await provider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffffff800000000');
    await provider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffffe0000000000');
    await provider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'ffffffc000000000');
    await provider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffff00000000000');

    expect(vi.mocked(generateWork).mock.calls.map((call) => call[1])).toEqual([
      WorkType.Send,
      WorkType.Receive,
      WorkType.Epoch1,
      WorkType.Dev,
    ]);
  });
});
