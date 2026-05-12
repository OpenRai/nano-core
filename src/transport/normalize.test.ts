import { describe, expect, it, vi } from 'vitest';
import { normalizeEndpoints } from './normalize.js';
import { NanoTransportConfigError } from './errors.js';

describe('normalizeEndpoints', () => {
  it('defaults userinfo auth to bearer-header', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['https://mykey:@rpc.example.com'],
      defaults: [],
    });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].auth).toEqual({
      type: 'api-key',
      value: 'mykey',
      source: 'userinfo',
      policy: 'bearer-header',
    });
    expect(endpoints[0].url.toString()).toBe('https://rpc.example.com/');
    expect(endpoints[0].auditLabel).toBe('https://rpc.example.com/ (api-key used)');
  });

  it('extracts ?key= and defaults to bearer-header', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['https://rpc.example.com/?key=mykey'],
      defaults: [],
    });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].auth).toEqual({
      type: 'api-key',
      value: 'mykey',
      source: 'query',
      policy: 'bearer-header',
    });
    expect(endpoints[0].url.toString()).toBe('https://rpc.example.com/');
  });

  it('extracts ?api_key= and defaults to bearer-header', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['https://rpc.example.com/?api_key=mykey'],
      defaults: [],
    });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].auth).toEqual({
      type: 'api-key',
      value: 'mykey',
      source: 'query',
      policy: 'bearer-header',
    });
    expect(endpoints[0].url.toString()).toBe('https://rpc.example.com/');
  });

  it('extracts ?apiKey= and defaults to bearer-header', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['https://rpc.example.com/?apiKey=mykey'],
      defaults: [],
    });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].auth).toEqual({
      type: 'api-key',
      value: 'mykey',
      source: 'query',
      policy: 'bearer-header',
    });
    expect(endpoints[0].url.toString()).toBe('https://rpc.example.com/');
  });

  it('allows explicit basic-header override for userinfo', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['https://mykey:@rpc.example.com'],
      defaults: [],
      transportPolicy: 'basic-header',
    });
    expect(endpoints[0].auth).toEqual({
      type: 'api-key',
      value: 'mykey',
      source: 'userinfo',
      policy: 'basic-header',
    });
  });

  it('allows explicit basic-header override for query params', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['https://rpc.example.com/?key=mykey'],
      defaults: [],
      transportPolicy: 'basic-header',
    });
    expect(endpoints[0].auth).toEqual({
      type: 'api-key',
      value: 'mykey',
      source: 'query',
      policy: 'basic-header',
    });
  });

  it('deduplicates identical normalized endpoints', () => {
    const warn = vi.fn();
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: [
        'https://mykey:@rpc.example.com',
        'https://mykey:@rpc.example.com',
      ],
      defaults: [],
      warn,
    });
    expect(endpoints).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('duplicate')
    );
  });

  it('warns and skips malformed URLs', () => {
    const warn = vi.fn();
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['not-a-url', 'https://rpc.example.com'],
      defaults: [],
      warn,
    });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].url.toString()).toBe('https://rpc.example.com/');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring malformed RPC endpoint')
    );
  });

  it('falls back to env when inputs are empty', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: [],
      env: 'https://key:@env.example.com',
      defaults: ['https://default.example.com'],
    });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].url.hostname).toBe('env.example.com');
  });

  it('falls back to defaults when inputs and env are empty', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: [],
      env: '',
      defaults: ['https://default.example.com'],
    });
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].url.hostname).toBe('default.example.com');
  });

  it('throws when no valid endpoints remain', () => {
    expect(() =>
      normalizeEndpoints({
        kind: 'rpc',
        inputs: ['not-a-url'],
        defaults: [],
      })
    ).toThrow(NanoTransportConfigError);
  });

  it('strips userinfo password as well', () => {
    const endpoints = normalizeEndpoints({
      kind: 'rpc',
      inputs: ['https://user:pass@rpc.example.com'],
      defaults: [],
    });
    expect(endpoints[0].url.toString()).toBe('https://rpc.example.com/');
    expect(endpoints[0].auth.value).toBe('user');
  });

  it('handles ws kind with userinfo', () => {
    const endpoints = normalizeEndpoints({
      kind: 'ws',
      inputs: ['wss://token:@ws.example.com'],
      defaults: [],
    });
    expect(endpoints[0].auth.policy).toBe('bearer-header');
    expect(endpoints[0].url.toString()).toBe('wss://ws.example.com/');
  });
});
