import { describe, expect, it, vi } from 'vitest';
import { buildHeaders, HttpEndpointPool } from './http.js';
import type { NormalizedEndpoint } from './types.js';

function makeEndpoint(auth: NormalizedEndpoint['auth']): NormalizedEndpoint {
  return {
    kind: 'rpc',
    originalInput: 'https://rpc.example.com',
    url: new URL('https://rpc.example.com/'),
    auth,
    auditLabel: 'https://rpc.example.com/ (test)',
  };
}

describe('buildHeaders', () => {
  it('returns Basic auth for basic-header policy', () => {
    const endpoint = makeEndpoint({
      type: 'api-key',
      value: 'mykey',
      source: 'userinfo',
      policy: 'basic-header',
    });
    const headers = buildHeaders(endpoint);
    expect(headers['Authorization']).toBe(`Basic ${btoa('mykey:')}`);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('returns Bearer auth for bearer-header policy', () => {
    const endpoint = makeEndpoint({
      type: 'api-key',
      value: 'mykey',
      source: 'query',
      policy: 'bearer-header',
    });
    const headers = buildHeaders(endpoint);
    expect(headers['Authorization']).toBe('Bearer mykey');
  });

  it('omits Authorization for json-body-key policy', () => {
    const endpoint = makeEndpoint({
      type: 'api-key',
      value: 'mykey',
      source: 'query',
      policy: 'json-body-key',
    });
    const headers = buildHeaders(endpoint);
    expect(headers).not.toHaveProperty('Authorization');
  });

  it('returns Bearer header for bearer-and-json-body-key policy', () => {
    const endpoint = makeEndpoint({
      type: 'api-key',
      value: 'mykey',
      source: 'query',
      policy: 'bearer-and-json-body-key',
    });
    const headers = buildHeaders(endpoint);
    expect(headers['Authorization']).toBe('Bearer mykey');
  });

  it('returns no Authorization header when auth type is none', () => {
    const endpoint = makeEndpoint({ type: 'none' });
    const headers = buildHeaders(endpoint);
    expect(headers).not.toHaveProperty('Authorization');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('merges extra headers', () => {
    const endpoint = makeEndpoint({ type: 'none' });
    const headers = buildHeaders(endpoint, { 'X-Custom': 'value' });
    expect(headers['X-Custom']).toBe('value');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('extra headers override Content-Type', () => {
    const endpoint = makeEndpoint({ type: 'none' });
    const headers = buildHeaders(endpoint, { 'Content-Type': 'text/plain' });
    expect(headers['Content-Type']).toBe('text/plain');
  });
});

describe('HttpEndpointPool auth application', () => {
  it('applies a JSON-body policy to the actual request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pool = new HttpEndpointPool({
      urls: ['https://rpc.example.com/?api_key=secret'],
      defaults: [],
      transportPolicy: 'json-body-key',
      allowLegacyAuth: true,
    });

    await pool.postJson({ action: 'account_info' });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(request.body).toBe(JSON.stringify({ action: 'account_info', key: 'secret' }));
    vi.unstubAllGlobals();
  });
});
