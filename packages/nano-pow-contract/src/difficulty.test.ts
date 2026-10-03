import { describe, expect, it } from 'vitest';
import {
  SmokeTestDifficulty,
  WorkDifficulty,
  workDifficultyToThreshold,
  type NamedWorkDifficulty,
} from './difficulty.js';

describe('difficulty vocabulary', () => {
  it('exposes exactly the current network levels', () => {
    expect(WorkDifficulty).toEqual({ Send: 'send', Receive: 'receive' });
  });

  it('keeps smoke test levels out of the network namespace', () => {
    expect(SmokeTestDifficulty).toEqual({ Dev: 'dev' });
    expect(Object.keys(WorkDifficulty)).not.toContain('Dev');
  });
});

describe('workDifficultyToThreshold', () => {
  it('resolves canonical network levels', () => {
    expect(workDifficultyToThreshold(WorkDifficulty.Send)).toBe('fffffff800000000');
    expect(workDifficultyToThreshold(WorkDifficulty.Receive)).toBe('fffffe0000000000');
  });

  it('resolves smoke test levels', () => {
    expect(workDifficultyToThreshold(SmokeTestDifficulty.Dev)).toBe('fe00000000000000');
  });

  it('accepts names case-insensitively', () => {
    expect(workDifficultyToThreshold('send')).toBe('fffffff800000000');
    expect(workDifficultyToThreshold('RECEIVE')).toBe('fffffe0000000000');
    expect(workDifficultyToThreshold('Dev')).toBe('fe00000000000000');
  });

  it('tolerates surrounding whitespace', () => {
    expect(workDifficultyToThreshold('  send  ')).toBe('fffffff800000000');
    expect(workDifficultyToThreshold('\tdev\n')).toBe('fe00000000000000');
  });

  it('passes hex through and canonicalizes its case', () => {
    expect(workDifficultyToThreshold('fffffff800000000')).toBe('fffffff800000000');
    expect(workDifficultyToThreshold('FFFFFFF800000000')).toBe('fffffff800000000');
  });

  it('round-trips every named level through its own hex', () => {
    const named: NamedWorkDifficulty[] = [WorkDifficulty.Send, WorkDifficulty.Receive, SmokeTestDifficulty.Dev];
    for (const level of named) {
      expect(workDifficultyToThreshold(workDifficultyToThreshold(level))).toBe(workDifficultyToThreshold(level));
    }
  });

  it('rejects values that are neither a known name nor 16-char hex', () => {
    expect(() => workDifficultyToThreshold('not-a-difficulty')).toThrow('Unsupported Nano work difficulty');
    expect(() => workDifficultyToThreshold('epoch1')).toThrow('Unsupported Nano work difficulty');
    expect(() => workDifficultyToThreshold('fffffff8')).toThrow('Unsupported Nano work difficulty');
    expect(() => workDifficultyToThreshold('')).toThrow('Unsupported Nano work difficulty');
  });

  it('rejects hex of the wrong length even when it is only hex digits', () => {
    expect(() => workDifficultyToThreshold('fffffff80000000000')).toThrow('Unsupported Nano work difficulty');
  });
});