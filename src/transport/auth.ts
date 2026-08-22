import type { EndpointAuth, EndpointKind, TransportPolicy } from './types.js';
import { NanoTransportConfigError } from './errors.js';

const API_KEY_QUERY_KEYS = ['key', 'apiKey', 'api_key'];

/**
 * Extracts credential-bearing URL input and leaves the URL canonical and
 * secret-free. Transport modules use the returned auth metadata later.
 */
export function extractEndpointAuth(
  url: URL,
  kind: EndpointKind,
  transportPolicy?: TransportPolicy,
): EndpointAuth {
  if (url.password !== '') {
    throw new NanoTransportConfigError('endpoint credentials must not include a password');
  }

  for (const key of API_KEY_QUERY_KEYS) {
    const value = url.searchParams.get(key);
    if (value && value.trim() !== '') {
      assertValidApiKey(value);
      url.searchParams.delete(key);
      return {
        type: 'api-key',
        value,
        source: 'query',
        policy: transportPolicy ?? defaultPolicy(kind),
      };
    }
  }

  if (url.username.trim() !== '') {
    let value: string;
    try {
      value = decodeURIComponent(url.username);
    } catch {
      throw new NanoTransportConfigError('endpoint API key is not valid percent-encoded text');
    }
    assertValidApiKey(value);
    url.username = '';
    url.password = '';
    return {
      type: 'api-key',
      value,
      source: 'userinfo',
      policy: transportPolicy ?? defaultPolicy(kind),
    };
  }

  return { type: 'none' };
}

export interface HttpAuthApplication {
  headers: Record<string, string>;
  payload: Record<string, unknown>;
}

/** Applies the endpoint auth policy to one JSON request. */
export function applyHttpAuth(
  auth: EndpointAuth,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): HttpAuthApplication {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders ?? {}),
  };

  if (auth.type === 'none') {
    return { headers, payload: body };
  }

  if (auth.policy === 'basic-header') {
    headers['Authorization'] = `Basic ${btoa(`${auth.value}:`)}`;
  } else if (auth.policy === 'bearer-header' || auth.policy === 'bearer-and-json-body-key') {
    headers['Authorization'] = `Bearer ${auth.value}`;
  }

  const payload = auth.policy === 'json-body-key' || auth.policy === 'bearer-and-json-body-key'
    ? { ...body, key: auth.value }
    : body;

  return { headers, payload };
}

/**
 * Applies credentials to a native WebSocket URL. Native WebSocket does not
 * expose a portable custom-header constructor, so the provider-compatible
 * query form is used for every authenticated endpoint.
 */
export function applyWebSocketAuth(url: URL, auth: EndpointAuth): URL {
  const connectionUrl = new URL(url);
  if (auth.type === 'api-key') {
    connectionUrl.searchParams.set('api_key', auth.value);
  }
  return connectionUrl;
}

function defaultPolicy(_kind: EndpointKind): TransportPolicy {
  return 'bearer-header';
}

function assertValidApiKey(value: string): void {
  if (!/^[A-Za-z0-9._~+\/-]+={0,}$/.test(value)) {
    throw new NanoTransportConfigError('endpoint API key is not a valid RFC 6750 token');
  }
}
