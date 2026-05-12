let initialized = false;

export async function ensureWebGPU(): Promise<void> {
  if (initialized) return;

  if (typeof navigator !== 'undefined' && (navigator as { gpu?: unknown }).gpu) {
    initialized = true;
    return;
  }

  try {
    const { create, globals } = await import('webgpu');
    Object.assign(globalThis, globals);
    if (!('navigator' in globalThis) || !globalThis.navigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: { gpu: create([]) },
        writable: true,
        configurable: true,
      });
    } else {
      (globalThis.navigator as unknown as Record<string, unknown>).gpu = create([]);
    }
    initialized = true;
  } catch (error) {
    console.warn('[nano-core] WebGPU not available:', error);
  }
}
