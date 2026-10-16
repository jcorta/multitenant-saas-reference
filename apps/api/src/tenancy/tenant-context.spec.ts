import { EntityManager } from 'typeorm';
import { TenantContext } from './tenant-context';

const manager = {} as EntityManager;

describe('TenantContext', () => {
  it('throws when accessed outside a tenant context', () => {
    expect(() => TenantContext.tenantId()).toThrow(/No tenant context/);
    expect(() => TenantContext.manager()).toThrow(/No tenant context/);
  });

  it('exposes the tenant inside run, across awaits', async () => {
    await TenantContext.run({ tenantId: 'a', manager }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(TenantContext.tenantId()).toBe('a');
    });
  });

  it('keeps concurrent contexts separate', async () => {
    const seen: string[] = [];
    const task = (tenantId: string, delay: number) =>
      TenantContext.run({ tenantId, manager }, async () => {
        await new Promise((r) => setTimeout(r, delay));
        seen.push(`${tenantId}:${TenantContext.tenantId()}`);
      });
    await Promise.all([task('a', 20), task('b', 5)]);
    expect(seen.sort()).toEqual(['a:a', 'b:b']);
  });

  it('does not leak the tenant after the context ends', async () => {
    await TenantContext.run({ tenantId: 'a', manager }, async () => undefined);
    expect(() => TenantContext.tenantId()).toThrow();
  });
});
