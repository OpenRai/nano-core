export class NanoTransportConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NanoTransportConfigError';
  }
}
