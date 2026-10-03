import { describe, expect, it, vi } from 'vitest';
import { workDifficultyToThreshold as contractWorkDifficultyToThreshold } from '@openrai/nano-pow-contract';
import { WorkDifficulty, WorkProvider, workDifficultyToThreshold } from './WorkProvider.js';
import type { PowEngine } from '@openrai/nano-pow-contract';

const ROOT = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

describe('WorkProvider routing', () => {
  const local: PowEngine = { name: 'test-local', generate: vi.fn(async () => '1111111111111111'), validate: vi.fn(() => true) };

  it('uses local work when the route selects local', async () => {
    const provider = WorkProvider.auto({ localEngine: local, selectRoute: () => 'local' });

    await expect(provider.generate(ROOT, 'send')).resolves.toBe('1111111111111111');
    expect(local.generate).toHaveBeenCalledWith(ROOT, 'fffffff800000000');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({
      mode: 'local',
      backend: 'test-local',
      fallbackFromRemote: false,
    });
  });

  it('uses the configured remote adapter when the route selects remote', async () => {
    const remote = { name: 'test-remote', generate: vi.fn(async () => '1111111111111111') };
    const provider = WorkProvider.auto({ localEngine: local, remoteEngine: remote, selectRoute: () => 'remote' });

    await expect(provider.generate(ROOT, 'receive')).resolves.toBe('1111111111111111');
    expect(remote.generate).toHaveBeenCalledWith(ROOT, 'fffffe0000000000');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({
      mode: 'remote',
      backend: 'test-remote',
      fallbackFromRemote: false,
    });
  });

  it('fails instead of silently using local work when remote work is unavailable', async () => {
    vi.mocked(local.generate).mockClear();
    const provider = WorkProvider.auto({ localEngine: local, selectRoute: () => 'remote' });

    await expect(provider.generate(ROOT, 'send')).rejects.toThrow('no work endpoints are configured');
    expect(local.generate).not.toHaveBeenCalled();
  });

  it('uses local work after a remote failure only when explicitly configured', async () => {
    const remote = { name: 'test-remote', generate: vi.fn(async () => { throw new Error('remote down'); }) };
    const provider = WorkProvider.auto({
      remoteEngine: remote,
      localEngine: local,
      selectRoute: () => 'remote',
      onRemoteFailure: 'local',
    });

    await expect(provider.generate(ROOT, 'send')).resolves.toBe('1111111111111111');
    expect(provider.getAuditReport().lastGenerationTrace).toEqual({
      mode: 'local',
      backend: 'test-local',
      fallbackFromRemote: true,
    });
  });

  it('rejects unknown work difficulties before dispatching work', async () => {
    vi.mocked(local.validate).mockClear();
    const provider = WorkProvider.local({ localEngine: local });

    await expect(provider.generate(ROOT, 'not-a-threshold')).rejects.toThrow('Unsupported Nano work difficulty');
    expect(local.validate).not.toHaveBeenCalled();
  });
});

describe('workDifficultyToThreshold', () => {
  it('resolves canonical levels to the thresholds the contract defines', () => {
    expect(workDifficultyToThreshold(WorkDifficulty.Send)).toBe('fffffff800000000');
    expect(workDifficultyToThreshold(WorkDifficulty.Receive)).toBe('fffffe0000000000');
    expect(workDifficultyToThreshold(WorkDifficulty.Dev)).toBe('fe00000000000000');
  });

  it('accepts level names case-insensitively', () => {
    expect(workDifficultyToThreshold('Send')).toBe('fffffff800000000');
    expect(workDifficultyToThreshold('RECEIVE')).toBe('fffffe0000000000');
  });

  it('keeps accepting the legacy Epoch 1 spellings', () => {
    // Retained for compatibility only; the canonical vocabulary omits historical levels.
    for (const alias of ['legacy-epoch1', 'LegacyEpoch1', 'legacyepoch1', 'epoch1', 'EPOCH1']) {
      expect(workDifficultyToThreshold(alias)).toBe('ffffffc000000000');
    }
  });

  it('passes any 16-hex threshold through and canonicalizes its case', () => {
    expect(workDifficultyToThreshold('fffffff800000000')).toBe('fffffff800000000');
    expect(workDifficultyToThreshold('FFFFFFF800000000')).toBe('fffffff800000000');
    expect(workDifficultyToThreshold('1234567890abcdef')).toBe('1234567890abcdef');
  });

  it('tolerates surrounding whitespace', () => {
    expect(workDifficultyToThreshold('  send  ')).toBe('fffffff800000000');
  });

  it('throws for unrecognized input', () => {
    expect(() => workDifficultyToThreshold('not-a-threshold')).toThrow('Unsupported Nano work difficulty');
    expect(() => workDifficultyToThreshold('fffffff8')).toThrow('Unsupported Nano work difficulty');
  });

  it('agrees with the contract on every canonical level', () => {
    // Guards against the two packages drifting apart.
    for (const level of [WorkDifficulty.Send, WorkDifficulty.Receive]) {
      expect(workDifficultyToThreshold(level)).toBe(contractWorkDifficultyToThreshold(level));
    }
  });
});
