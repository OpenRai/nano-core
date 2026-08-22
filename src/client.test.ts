import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NanoClient } from './client.js';

vi.mock('nano-rspow-node', () => ({
  WorkType: { Send: 'Send', Receive: 'Receive', LegacyEpoch1: 'LegacyEpoch1', Epoch1: 'Epoch1', Dev: 'Dev' },
  generateWork: vi.fn(async () => '1111111111111111'),
  validateWork: vi.fn(() => true),
  recommendLocalPow: vi.fn(() => true),
  clearPowTuningCache: vi.fn(() => true),
  workTypeToHex: vi.fn((wt: string) => {
    const map: Record<string, string> = {
      Send: 'fffffff800000000',
      Receive: 'fffffe0000000000',
      LegacyEpoch1: 'ffffffc000000000',
      Epoch1: 'ffffffc000000000',
      Dev: 'fe00000000000000',
    };
    return map[wt] ?? map.Send;
  }),
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.onopen?.();
    });
  }
}

describe('NanoClient endpoint observation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits rpc endpoint change events and tracks active rpc endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ balance: '0', frontier: 'abc', representative: 'nano_1rep', blockCount: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const client = NanoClient.initialize({ rpc: ['https://rpc.example.com'] });
    const events: string[] = [];
    client.onEndpointChange((event) => events.push(`${event.kind}:${event.status}:${event.activeUrl}`));

    await client.rpcPool.postJson({ action: 'account_info', account: 'nano_1111111111111111111111111111111111111111111111111111hifc8npp' });

    expect(events).toEqual(['rpc:connected:https://rpc.example.com/']);
    expect(client.getActiveEndpoints()).toEqual({ rpc: 'https://rpc.example.com/' });
  });

  it('emits ws endpoint change events and tracks active ws endpoint', async () => {
    const client = NanoClient.initialize({ ws: ['wss://ws.example.com'] });
    const events: string[] = [];
    client.onEndpointChange((event) => events.push(`${event.kind}:${event.status}:${event.activeUrl}`));

    await client.wsPool.connect();

    expect(events).toEqual(['ws:connected:wss://ws.example.com/']);
    expect(client.getActiveEndpoints()).toEqual({ ws: 'wss://ws.example.com/' });
  });

  it('uses local work generation without activating a work endpoint', async () => {
    const client = NanoClient.initialize();
    const events: string[] = [];
    client.onEndpointChange((event) => events.push(`${event.kind}:${event.status}:${event.activeUrl}`));

    await client.workProvider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffffff800000000');

    expect(events).toEqual([]);
    expect(client.getActiveEndpoints()).toEqual({});
  });

  it('routes remote work through the work pool and tracks the selected endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('unavailable', { status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ work: '1111111111111111' }), { status: 200 }));
    const client = NanoClient.initialize({
      work: ['https://work-one.example.com', 'https://work-two.example.com'],
      workRouting: { selectRoute: () => 'remote' },
    });

    await expect(client.workProvider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'send'))
      .resolves.toBe('1111111111111111');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getActiveEndpoints()).toEqual({ work: 'https://work-two.example.com/' });
    expect(client.getAuditReport().work).toHaveLength(2);
  });

  it('supports unsubscribing endpoint listeners', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ balance: '0', frontier: 'abc', representative: 'nano_1rep', blockCount: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const client = NanoClient.initialize({ rpc: ['https://rpc.example.com'] });
    const listener = vi.fn();
    const unsubscribe = client.onEndpointChange(listener);
    unsubscribe();

    await client.rpcPool.postJson({ action: 'account_info', account: 'nano_1111111111111111111111111111111111111111111111111111hifc8npp' });

    expect(listener).not.toHaveBeenCalled();
    expect(client.getActiveEndpoints()).toEqual({ rpc: 'https://rpc.example.com/' });
  });
});
