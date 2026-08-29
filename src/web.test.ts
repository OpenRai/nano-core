import { describe, expect, it, vi } from 'vitest';

const { recommendLocalPowMock } = vi.hoisted(() => ({
  recommendLocalPowMock: vi.fn(async () => true),
}));

vi.mock('nano-rspow-web', () => ({
  createPowEngine: vi.fn(),
  recommendLocalPow: recommendLocalPowMock,
}));

import { recommendLocalPow } from './web.js';

describe('web PoW recommendation facade', () => {
  it('forwards the default cache-aware probe', async () => {
    await expect(recommendLocalPow()).resolves.toBe(true);
    expect(recommendLocalPowMock).toHaveBeenLastCalledWith();
  });

  it('forwards a forced re-probe', async () => {
    await expect(recommendLocalPow(true)).resolves.toBe(true);
    expect(recommendLocalPowMock).toHaveBeenLastCalledWith(true);
  });
});
