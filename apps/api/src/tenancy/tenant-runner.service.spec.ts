import { DataSource, EntityManager } from 'typeorm';
import { TenantContext } from './tenant-context';
import { TenantRunner } from './tenant-runner.service';

const TENANT = '11111111-1111-4111-8111-111111111111';

function setup() {
  const manager = { query: jest.fn().mockResolvedValue([]) } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;
  return { manager, runner: new TenantRunner(dataSource) };
}

describe('TenantRunner.runInTenantContext', () => {
  it('sets the transaction-local tenant setting before running the callback', async () => {
    const { manager, runner } = setup();
    const order: string[] = [];
    (manager.query as jest.Mock).mockImplementation(async () => void order.push('set_config'));

    await runner.runInTenantContext(TENANT, async () => void order.push('fn'));

    expect(order).toEqual(['set_config', 'fn']);
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('set_config'), [TENANT]);
    expect((manager.query as jest.Mock).mock.calls[0][0]).toContain('true)');
  });

  it('binds the tenant, manager and identity into the context', async () => {
    const { manager, runner } = setup();
    const identity = { userId: 'u1', role: 'staff' as const };

    await runner.runInTenantContext(
      TENANT,
      async () => {
        expect(TenantContext.tenantId()).toBe(TENANT);
        expect(TenantContext.manager()).toBe(manager);
        expect(TenantContext.current().identity).toEqual(identity);
      },
      identity,
    );
  });

  it('returns the callback result and propagates its errors', async () => {
    const { runner } = setup();
    await expect(runner.runInTenantContext(TENANT, async () => 42)).resolves.toBe(42);
    await expect(
      runner.runInTenantContext(TENANT, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('rejects ids that are not UUIDs before touching the database', () => {
    const { manager, runner } = setup();
    expect(() => runner.runInTenantContext("x'; drop table users;--", async () => 1)).toThrow();
    expect(manager.query).not.toHaveBeenCalled();
  });
});
