import { describe, expect, it } from 'vitest';
import { applyHttpAuth, applyWebSocketAuth, extractEndpointAuth } from './auth.js';

describe('transport auth seam', () => {
  it('extracts query credentials and canonicalizes the URL', () => {
    const url = new URL('https://rpc.example.com/?api_key=secret&region=eu');

    const auth = extractEndpointAuth(url, 'rpc');

    expect(auth).toEqual({
      type: 'api-key',
      value: 'secret',
      source: 'query',
      policy: 'bearer-header',
    });
    expect(url.toString()).toBe('https://rpc.example.com/?region=eu');
  });

  it('rejects non-empty userinfo passwords', () => {
    expect(() => extractEndpointAuth(new URL('https://key:password@rpc.example.com'), 'rpc'))
      .toThrow('endpoint credentials must not include a password');
  });

  it('rejects keys outside the RFC 6750 token grammar', () => {
    expect(() => extractEndpointAuth(new URL('https://rpc.example.com/?api_key=not%20valid'), 'rpc'))
      .toThrow('endpoint API key is not a valid RFC 6750 token');
  });

  it('applies body-only and header-only policies without leaking policy decisions', () => {
    const bodyOnly = applyHttpAuth(
      { type: 'api-key', value: 'secret', source: 'query', policy: 'json-body-key' },
      { action: 'account_info' },
    );
    const both = applyHttpAuth(
      { type: 'api-key', value: 'secret', source: 'query', policy: 'bearer-and-json-body-key' },
      { action: 'account_info' },
    );

    expect(bodyOnly.headers).not.toHaveProperty('Authorization');
    expect(bodyOnly.payload).toEqual({ action: 'account_info', key: 'secret' });
    expect(both.headers['Authorization']).toBe('Bearer secret');
    expect(both.payload).toEqual({ action: 'account_info', key: 'secret' });
  });

  it('uses the native WebSocket query fallback without changing the canonical URL', () => {
    const canonicalUrl = new URL('wss://ws.example.com/');
    const connectUrl = applyWebSocketAuth(canonicalUrl, {
      type: 'api-key',
      value: 'secret',
      source: 'query',
      policy: 'bearer-header',
    });

    expect(connectUrl.toString()).toBe('wss://ws.example.com/?api_key=secret');
    expect(canonicalUrl.toString()).toBe('wss://ws.example.com/');
  });
});
