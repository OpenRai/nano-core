import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NanoClient } from './client.js';

vi.mock('nano-pow-with-fallback', () => {
  class MockPowService {
    public ready = Promise.resolve();
    public backend = 'wasm';
    async getProofOfWork(): Promise<{ backend: string; proofOfWork: string }> {
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

  it('emits work endpoint change events and tracks active work endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ work: '0000000000000000' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const client = NanoClient.initialize({ work: ['https://work.example.com'] });
    const events: string[] = [];
    client.onEndpointChange((event) => events.push(`${event.kind}:${event.status}:${event.activeUrl}`));

    await client.workProvider.generate('ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789', 'fffffff800000000');

    expect(events).toEqual(['work:connected:https://work.example.com/']);
    expect(client.getActiveEndpoints()).toEqual({ work: 'https://work.example.com/' });
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
