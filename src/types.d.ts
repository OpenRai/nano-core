declare module 'nano-pow-with-fallback' {
  export const PowBackendName: {
    WEBGPU: 'webgpu';
    WEBGL: 'webgl';
    WASM: 'wasm';
  };

  export class PowService {
    constructor(options?: { disabledBackends?: string[] });
    readonly ready: Promise<unknown>;
    readonly backend: string | null;
    getProofOfWork(input: { hash: string; threshold: string }): Promise<{
      backend: string;
      proofOfWork: string;
      iterations?: number;
    }>;
    cancel(): void;
  }

  export class PowServiceAbortError extends Error {}
}
