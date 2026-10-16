import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext, TenantIdentity } from './tenant-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Single entry point for running logic as a tenant. It opens a transaction, sets the
 * transaction-local `app.tenant_id` that the RLS policies read, binds the tenant context and
 * commits or rolls back with `fn`. HTTP requests, background jobs and other non-HTTP callers all
 * go through here, so there is exactly one isolation path.
 *
 * The caller must obtain `tenantId` from a trusted source (a verified token, a stored row), never
 * from client input.
 */
@Injectable()
export class TenantRunner {
  constructor(private readonly dataSource: DataSource) {}

  runInTenantContext<T>(
    tenantId: string,
    fn: () => Promise<T>,
    identity?: TenantIdentity,
  ): Promise<T> {
    if (!UUID.test(tenantId)) {
      throw new Error('runInTenantContext requires a valid tenant id');
    }
    // A nested call would open a second transaction and silently switch the tenant for the inner
    // code, so nesting is refused rather than allowed to shadow the outer context.
    if (TenantContext.isActive()) {
      throw new Error('runInTenantContext cannot be nested inside an existing tenant context');
    }
    return this.dataSource.transaction(async (manager) => {
      // is_local = true scopes the setting to this transaction, so a pooled connection never
      // carries a tenant over to the next borrower.
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      return TenantContext.run({ tenantId, manager, identity }, fn);
    });
  }
}
