export type EndpointKind = 'rpc' | 'ws' | 'work';

export type AuthSource = 'explicit' | 'query' | 'userinfo';

export type TransportPolicy = 'bearer-header' | 'json-body-key' | 'bearer-and-json-body-key';

export type EndpointAuth =
  | { type: 'none' }
  | { type: 'api-key'; value: string; source: AuthSource; policy: TransportPolicy };

export interface NormalizedEndpoint {
  kind: EndpointKind;
  originalInput: string;
  url: URL;
  auth: EndpointAuth;
  auditLabel: string;
}

export interface EndpointState {
  endpoint: NormalizedEndpoint;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  cooldownUntil: number;
  lastLatencyMs: number | null;
}

export interface EndpointAuditRecord {
  kind: EndpointKind;
  url: string;
  authUsed: boolean;
  authSource: AuthSource | null;
  policy: TransportPolicy | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  cooldownUntil: string | null;
  lastLatencyMs: number | null;
}

export interface EndpointActivityEvent {
  kind: EndpointKind;
  status: 'connected' | 'failover';
  activeUrl: string;
  previousUrl?: string;
}

export interface EndpointPoolOptions {
  kind: EndpointKind;
  env?: string;
  urls?: string[];
  defaults: string[];
  warn?: (message: string) => void;
  now?: () => number;
  transportPolicy?: TransportPolicy;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onActiveEndpointChange?: (event: EndpointActivityEvent) => void;
}
