import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkProvider } from './WorkProvider.js';
import { generateWork, validateWork } from 'nano-rspow-node';

vi.mock('nano-rspow-node', () => ({
  WorkType: { Send: 'Send', Receive: 'Receive', LegacyEpoch1: 'LegacyEpoch1', Epoch1: 'Epoch1', Dev: 'Dev' },
  generateWork: vi.fn(async () => '1111111111111111'),
  validateWork: vi.fn(() => true),
  recommendLocalPow: vi.fn(() => true),
  clearPowTuningCache: vi.fn(() => true),
  workTypeToHex: vi.fn((workType: string) => ({
    Send: 'fffffff800000000',
    Receive: 'fffffe0000000000',
    LegacyEpoch1: 'ffffffc000000000',
    Dev: 'fe00000000000000',
  })[workType]),
}));

const ROOT = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

describe('WorkProvider routing', () => {
  beforeEach(() => {
    vi.mocked(generateWork).mockClear();
    vi.mocked(validateWork).mockClear();
  });

  it('uses local work when the route selects local', async () => {
    const provider = WorkProvider.auto({ selectRoute: () => 'local' });

    await expect(provider.generate(ROOT, 'send')).resolves.toBe('1111111111111111');
    expect(vi.mocked(generateWork)).toHaveBeenCalledWith(ROOT, 'Send');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({
      mode: 'local',
      backend: 'nano-rspow-node',
      fallbackFromRemote: false,
    });
  });

  it('uses the configured remote adapter when the route selects remote', async () => {
    const remote = { name: 'test-remote', generate: vi.fn(async () => '1111111111111111') };
    const provider = WorkProvider.auto({ remoteEngine: remote, selectRoute: () => 'remote' });

    await expect(provider.generate(ROOT, 'receive')).resolves.toBe('1111111111111111');
    expect(remote.generate).toHaveBeenCalledWith(ROOT, 'Receive');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({
      mode: 'remote',
      backend: 'test-remote',
      fallbackFromRemote: false,
    });
  });

  it('fails instead of silently using local work when remote work is unavailable', async () => {
    const provider = WorkProvider.auto({ selectRoute: () => 'remote' });

    await expect(provider.generate(ROOT, 'send')).rejects.toThrow('no work endpoints are configured');
    expect(vi.mocked(generateWork)).not.toHaveBeenCalled();
  });

  it('uses local work after a remote failure only when explicitly configured', async () => {
    const remote = { name: 'test-remote', generate: vi.fn(async () => { throw new Error('remote down'); }) };
    const provider = WorkProvider.auto({
      remoteEngine: remote,
      selectRoute: () => 'remote',
      onRemoteFailure: 'local',
    });

    await expect(provider.generate(ROOT, 'send')).resolves.toBe('1111111111111111');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({
      mode: 'local',
      backend: 'nano-rspow-node',
      fallbackFromRemote: true,
    });
  });

  it('rejects unknown work difficulties before dispatching work', async () => {
    const provider = WorkProvider.local();

    await expect(provider.generate(ROOT, 'not-a-threshold')).rejects.toThrow('Unsupported Nano work difficulty');
    expect(vi.mocked(validateWork)).not.toHaveBeenCalled();
  });
});
