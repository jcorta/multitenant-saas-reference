import { AsyncLocalStorage } from 'node:async_hooks';
import { EntityManager } from 'typeorm';

export interface TenantIdentity {
  userId: string;
  role: 'owner' | 'staff';
}

export interface TenantContextStore {
  tenantId: string;
  // Manager bound to the transaction that carries app.tenant_id. Every tenant-scoped query must
  // go through it so that Row-Level Security sees the same tenant as the application layer.
  manager: EntityManager;
  identity?: TenantIdentity;
}

const storage = new AsyncLocalStorage<TenantContextStore>();

export const TenantContext = {
  run<T>(store: TenantContextStore, fn: () => Promise<T>): Promise<T> {
    return storage.run(store, fn);
  },

  isActive(): boolean {
    return storage.getStore() !== undefined;
  },

  current(): TenantContextStore {
    const store = storage.getStore();
    if (!store) {
      throw new Error('No tenant context: tenant-scoped data access outside runInTenantContext');
    }
    return store;
  },

  tenantId(): string {
    return TenantContext.current().tenantId;
  },

  manager(): EntityManager {
    return TenantContext.current().manager;
  },
};
