import type { WorkExecutionPlan } from './WorkProvider.js';

export interface WorkPlanCacheStore {
  read(): WorkExecutionPlan | null;
  write(plan: WorkExecutionPlan): Promise<void>;
}

class MemoryCacheStore implements WorkPlanCacheStore {
  private cachedPlan: WorkExecutionPlan | null = null;

  public read(): WorkExecutionPlan | null {
    return this.cachedPlan;
  }

  public write(plan: WorkExecutionPlan): Promise<void> {
    this.cachedPlan = plan;
    return Promise.resolve();
  }
}

interface PersistentCachePayload {
  version: 1;
  fingerprint: string;
  createdAt: string;
  plan: WorkExecutionPlan;
}

class PersistentCacheStore implements WorkPlanCacheStore {
  private readonly fingerprint: string;
  private cachedPlan: WorkExecutionPlan | null = null;

  constructor(fingerprint: string) {
    this.fingerprint = fingerprint;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const os = require('node:os');
      const path = require('node:path');
      const fs = require('node:fs');

      const homeDir = os.homedir();
      const platform = os.platform();

      let cacheBase: string;
      if (platform === 'darwin') {
        cacheBase = path.join(homeDir, 'Library', 'Caches');
      } else if (platform === 'linux') {
        const xdgCache = process.env.XDG_CACHE_HOME;
        cacheBase = xdgCache ? xdgCache : path.join(homeDir, '.cache');
      } else {
        cacheBase = path.join(homeDir, '.cache');
      }

      const cachePath = path.join(cacheBase, 'nano-core', 'pow-plan.json');

      let content: string | null = null;
      try {
        fs.accessSync(cachePath);
        content = fs.readFileSync(cachePath, 'utf-8');
      } catch {
        this.cachedPlan = null;
        return;
      }

      if (!content) {
        this.cachedPlan = null;
        return;
      }

      let payload: PersistentCachePayload;
      try {
        payload = JSON.parse(content) as PersistentCachePayload;
      } catch {
        this.cachedPlan = null;
        return;
      }

      if (payload.version !== 1 || payload.fingerprint !== this.fingerprint) {
        this.cachedPlan = null;
        return;
      }

      this.cachedPlan = payload.plan;
    } catch {
      this.cachedPlan = null;
    }
  }

  public read(): WorkExecutionPlan | null {
    return this.cachedPlan;
  }

  public async write(plan: WorkExecutionPlan): Promise<void> {
    try {
      const [os, path, fs] = await Promise.all([
        import('node:os'),
        import('node:path'),
        import('node:fs'),
      ]);

      const homeDir = os.homedir();
      const platform = os.platform();

      let cacheBase: string;
      if (platform === 'darwin') {
        cacheBase = path.join(homeDir, 'Library', 'Caches');
      } else if (platform === 'linux') {
        const xdgCache = process.env.XDG_CACHE_HOME;
        cacheBase = xdgCache ? xdgCache : path.join(homeDir, '.cache');
      } else {
        cacheBase = path.join(homeDir, '.cache');
      }

      const cacheDir = path.join(cacheBase, 'nano-core');
      const cachePath = path.join(cacheDir, 'pow-plan.json');

      await fs.promises.mkdir(cacheDir, { recursive: true });

      const payload: PersistentCachePayload = {
        version: 1,
        fingerprint: this.fingerprint,
        createdAt: new Date().toISOString(),
        plan,
      };

      await fs.promises.writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf-8');
      this.cachedPlan = plan;
    } catch {
    }
  }
}

export function createCacheStore(
  strategy: 'persistent' | 'memory',
  fingerprint: string,
): WorkPlanCacheStore {
  if (strategy === 'memory') {
    return new MemoryCacheStore();
  }

  return new PersistentCacheStore(fingerprint);
}