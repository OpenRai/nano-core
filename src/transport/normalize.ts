import { NanoTransportConfigError } from './errors.js';
import type {
  EndpointKind,
  NormalizedEndpoint,
  TransportPolicy,
} from './types.js';
import { extractEndpointAuth } from './auth.js';

function allowedProtocols(kind: EndpointKind): string[] {
  switch (kind) {
    case 'rpc':
    case 'work':
      return ['http:', 'https:'];
    case 'ws':
      return ['ws:', 'wss:'];
  }
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
  allowLegacyAuth?: boolean;
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
      warn(`Ignoring malformed ${options.kind.toUpperCase()} endpoint: invalid URL`);
      continue;
    }

    if (!allowed.includes(url.protocol)) {
      warn(`Ignoring invalid ${options.kind.toUpperCase()} endpoint: expected ${allowed.join(' or ')}`);
      continue;
    }

    if (url.hostname.trim() === '') {
      warn(`Ignoring invalid ${options.kind.toUpperCase()} endpoint: hostname is required`);
      continue;
    }

    if (
      (options.kind === 'rpc' || options.kind === 'work') &&
      (options.transportPolicy === 'json-body-key' || options.transportPolicy === 'bearer-and-json-body-key') &&
      options.allowLegacyAuth !== true
    ) {
      throw new NanoTransportConfigError(
        'JSON-body API-key policies are legacy compatibility modes; set allowLegacyAuth to use them',
      );
    }

    let auth: NormalizedEndpoint['auth'];
    try {
      auth = extractEndpointAuth(url, options.kind, options.transportPolicy);
    } catch (error) {
      const reason = error instanceof NanoTransportConfigError ? error.message : 'invalid endpoint credentials';
      warn(`Ignoring invalid ${options.kind.toUpperCase()} endpoint: ${reason}`);
      continue;
    }

    normalizePath(url);

    const endpoint: NormalizedEndpoint = {
      kind: options.kind,
      originalInput: url.toString(),
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
