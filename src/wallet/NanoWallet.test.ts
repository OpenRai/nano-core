import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NanoClient } from '../client.js';
import { NanoAddress } from '../primitives/NanoAddress.js';
import { NanoAmount } from '../primitives/NanoAmount.js';
import { hashStateBlock, type StateBlock } from '../primitives/Block.js';
import { WorkProvider } from '../work/WorkProvider.js';

const SEED = '0'.repeat(64);
const PREVIOUS = 'A'.repeat(64);
const REPRESENTATIVE = 'nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4';
const DESTINATION = NanoAddress.parse('nano_3arg3asgtigae3xckabaaewkx3bzsh7nwz7jkmjos79ihyaxwphhm6qgjps4');

function localWork(): WorkProvider {
  return WorkProvider.local({
    localEngine: {
      name: 'test-local',
      generate: vi.fn(async () => '1111111111111111'),
      validate: vi.fn(() => true),
    },
  });
}

describe('NanoWallet', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('derives a single indexed address without retaining the seed on the public surface', () => {
    const wallet = NanoClient.initialize({ workProvider: localWork() }).hydrateWallet(SEED, { index: 1 });

    expect(wallet.index).toBe(1);
    expect(wallet.address.toString()).toMatch(/^nano_/);
    expect(wallet).not.toHaveProperty('seed');
  });

  it('builds, signs, works, and submits a send block', async () => {
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const payload = JSON.parse(String(request.body)) as Record<string, unknown>;
      if (payload.action === 'account_info') {
        return new Response(JSON.stringify({ frontier: PREVIOUS, balance: '100', representative: REPRESENTATIVE }), { status: 200 });
      }
      const block = payload.block as StateBlock;
      return new Response(JSON.stringify({ hash: hashStateBlock(block) }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = localWork();
    const wallet = NanoClient.initialize({ rpc: ['https://rpc.example.com'], workProvider: provider }).hydrateWallet(SEED);

    const hash = await wallet.send(DESTINATION, NanoAmount.fromRaw('25'));

    expect(hash).toMatch(/^[A-F0-9]{64}$/);
    const processRequest = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(processRequest).toMatchObject({ action: 'process', json_block: 'true', subtype: 'send' });
    expect(processRequest.block).toMatchObject({ previous: PREVIOUS, balance: '75', link: DESTINATION.publicKey.toUpperCase(), work: '1111111111111111' });
  });

  it('rejects insufficient balance before generating work or processing a block', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ frontier: PREVIOUS, balance: '10', representative: REPRESENTATIVE }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const wallet = NanoClient.initialize({ rpc: ['https://rpc.example.com'], workProvider: localWork() }).hydrateWallet(SEED);

    await expect(wallet.send(DESTINATION, NanoAmount.fromRaw('11'))).rejects.toThrow('exceeds current balance');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serializes sends from one wallet handle', async () => {
    const actions: string[] = [];
    let accountInfoCount = 0;
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const payload = JSON.parse(String(request.body)) as Record<string, unknown>;
      actions.push(String(payload.action));
      if (payload.action === 'account_info') {
        accountInfoCount += 1;
        return new Response(JSON.stringify({
          frontier: accountInfoCount === 1 ? PREVIOUS : 'B'.repeat(64),
          balance: accountInfoCount === 1 ? '100' : '75',
          representative: REPRESENTATIVE,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ hash: hashStateBlock(payload.block as StateBlock) }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const wallet = NanoClient.initialize({ rpc: ['https://rpc.example.com'], workProvider: localWork() }).hydrateWallet(SEED);

    await Promise.all([
      wallet.send(DESTINATION, NanoAmount.fromRaw('25')),
      wallet.send(DESTINATION, NanoAmount.fromRaw('25')),
    ]);

    expect(actions).toEqual(['account_info', 'process', 'account_info', 'process']);
  });

  it('rejects invalid seed and account index input', () => {
    const client = NanoClient.initialize({ workProvider: localWork() });

    expect(() => client.hydrateWallet('bad')).toThrow('64-character hexadecimal');
    expect(() => client.hydrateWallet(SEED, { index: -1 })).toThrow('non-negative safe integer');
  });
});
