import { NanoTransportConfigError } from './errors.js';
import type {
  EndpointKind,
  NormalizedEndpoint,
  TransportPolicy,
} from './types.js';

const API_KEY_QUERY_KEYS = ['key', 'apiKey', 'api_key'];

function allowedProtocols(kind: EndpointKind): string[] {
  switch (kind) {
    case 'rpc':
    case 'work':
      return ['http:', 'https:'];
    case 'ws':
      return ['ws:', 'wss:'];
  }
}

function defaultPolicy(kind: EndpointKind): TransportPolicy {
  return kind === 'ws' ? 'bearer-header' : 'bearer-header';
}

function normalizePath(url: URL): void {
  if (url.pathname === '') url.pathname = '/';
}

function canonicalKey(endpoint: NormalizedEndpoint): string {
  const authKey = endpoint.auth.type === 'api-key'
    ? `${endpoint.auth.type}:${endpoint.auth.value}:${endpoint.auth.policy}`
    : 'none';
  return `${endpoint.kind}:${endpoint.url.toString()}:${authKey}`;
}

export function normalizeEndpoints(options: {
  kind: EndpointKind;
  inputs?: string[];
  env?: string;
  defaults: string[];
  warn?: (message: string) => void;
  transportPolicy?: TransportPolicy;
}): NormalizedEndpoint[] {
  const warn = options.warn ?? (() => {});
  const rawInputs = options.inputs && options.inputs.length > 0
    ? options.inputs
    : options.env && options.env.trim() !== ''
      ? options.env.split(',')
      : options.defaults;

  const allowed = allowedProtocols(options.kind);
  const normalized: NormalizedEndpoint[] = [];
  const seen = new Set<string>();

  for (const raw of rawInputs) {
    const input = raw.trim();
    if (input === '') continue;

    let url: URL;
    try {
      url = new URL(input);
    } catch {
      warn(`Ignoring malformed ${options.kind.toUpperCase()} endpoint "${input}": invalid URL`);
      continue;
    }

    if (!allowed.includes(url.protocol)) {
      warn(`Ignoring invalid ${options.kind.toUpperCase()} endpoint "${input}": expected ${allowed.join(' or ')}`);
      continue;
    }

    if (url.hostname.trim() === '') {
      warn(`Ignoring invalid ${options.kind.toUpperCase()} endpoint "${input}": hostname is required`);
      continue;
    }

    let auth: NormalizedEndpoint['auth'] = { type: 'none' };

    for (const key of API_KEY_QUERY_KEYS) {
      const value = url.searchParams.get(key);
      if (value && value.trim() !== '') {
        auth = {
          type: 'api-key',
          value,
          source: 'query',
          policy: options.transportPolicy ?? defaultPolicy(options.kind),
        };
        url.searchParams.delete(key);
        break;
      }
    }

    if (auth.type === 'none' && url.username.trim() !== '') {
      auth = {
        type: 'api-key',
        value: decodeURIComponent(url.username),
        source: 'userinfo',
        policy: options.transportPolicy ?? defaultPolicy(options.kind),
      };
      url.username = '';
      url.password = '';
    }

    normalizePath(url);

    const endpoint: NormalizedEndpoint = {
      kind: options.kind,
      originalInput: input,
      url,
      auth,
      auditLabel: `${url.toString()}${auth.type === 'api-key' ? ' (api-key used)' : ' (no auth)'}`,
    };

    const dedupeKey = canonicalKey(endpoint);
    if (seen.has(dedupeKey)) {
      warn(`Ignoring duplicate ${options.kind.toUpperCase()} endpoint "${endpoint.auditLabel}"`);
      continue;
    }

    seen.add(dedupeKey);
    normalized.push(endpoint);
  }

  if (normalized.length === 0) {
    throw new NanoTransportConfigError(`No valid ${options.kind.toUpperCase()} endpoints remain after validation`);
  }

  return normalized;
}
