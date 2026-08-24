/**
 * Supported transport endpoint protocols.
 */
export type EndpointKind = 'rpc' | 'ws' | 'work';

/**
 * Extraction source of authentication credentials from an endpoint URI.
 */
export type AuthSource = 'explicit' | 'query' | 'userinfo';

/**
 * Strategy applied for transmitting API keys to Nano endpoints.
 */
export type TransportPolicy = 'bearer-header' | 'basic-header' | 'json-body-key' | 'bearer-and-json-body-key';

/**
 * Authentication configuration associated with a normalized endpoint.
 */
export type EndpointAuth =
  | { type: 'none' }
  | { type: 'api-key'; value: string; source: AuthSource; policy: TransportPolicy };

/**
 * Normalized and parsed endpoint configuration.
 */
export interface NormalizedEndpoint {
  kind: EndpointKind;
  originalInput: string;
  url: URL;
  auth: EndpointAuth;
  auditLabel: string;
}

/**
 * Runtime health state and failover metrics for an endpoint.
 */
export interface EndpointState {
  endpoint: NormalizedEndpoint;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  cooldownUntil: number;
  lastLatencyMs: number | null;
}

/**
 * Serializable health and configuration snapshot for endpoint auditing.
 */
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

/**
 * Emitted when an endpoint pool connects or performs failover.
 */
export interface EndpointActivityEvent {
  kind: EndpointKind;
  status: 'connected' | 'failover';
  activeUrl: string;
  previousUrl?: string;
}

/**
 * Configuration options for creating an `EndpointPool`.
 */
export interface EndpointPoolOptions {
  kind: EndpointKind;
  env?: string;
  urls?: string[];
  defaults: string[];
  warn?: (message: string) => void;
  now?: () => number;
  transportPolicy?: TransportPolicy;
  allowLegacyAuth?: boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onActiveEndpointChange?: (event: EndpointActivityEvent) => void;
}
