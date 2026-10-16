import { EntityManager } from 'typeorm';
import { TenantContext } from './tenant-context';
import { TenantRepository } from './tenant-repository';

interface Thing {
  id: string;
  tenantId: string;
  name: string;
}

class ThingRepository extends TenantRepository<Thing> {
  constructor() {
    super('Thing' as never);
  }
}

function inTenant<T>(tenantId: string, fn: (repo: Record<string, jest.Mock>) => Promise<T>) {
  const repo = {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  return TenantContext.run({ tenantId, manager }, () => fn(repo));
}

describe('TenantRepository', () => {
  const things = new ThingRepository();

  it('cannot be used outside a tenant context', () => {
    expect(() => things.find()).toThrow(/No tenant context/);
  });

  it('adds the context tenant to every read filter', async () => {
    await inTenant('t1', async (repo) => {
      await things.find();
      await things.find({ where: { name: 'x' } });
      await things.findAndCount();
      await things.findOne({ id: '1' });
      await things.count();

      expect(repo.find.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
      expect(repo.find.mock.calls[1][0].where).toEqual({ name: 'x', tenantId: 't1' });
      expect(repo.findAndCount.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
      expect(repo.findOne.mock.calls[0][0].where).toEqual({ id: '1', tenantId: 't1' });
      expect(repo.count.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
    });
  });

  it('does not let a caller-supplied tenantId override the context tenant', async () => {
    await inTenant('t1', async (repo) => {
      await things.find({ where: { tenantId: 'other' } });
      await things.findOne({ tenantId: 'other', id: '1' });
      expect(repo.find.mock.calls[0][0].where.tenantId).toBe('t1');
      expect(repo.findOne.mock.calls[0][0].where.tenantId).toBe('t1');
    });
  });

  it('stamps the context tenant on inserts, ignoring any supplied value', async () => {
    await inTenant('t1', async (repo) => {
      await things.save({ name: 'x', tenantId: 'other' });
      expect(repo.create).toHaveBeenCalledWith({ name: 'x', tenantId: 't1' });
    });
  });

  it('scopes updates and deletes and never rewrites tenantId', async () => {
    await inTenant('t1', async (repo) => {
      await things.update({ id: '1' }, { name: 'y', tenantId: 'other' });
      await things.delete({ id: '1' });
      expect(repo.update).toHaveBeenCalledWith({ id: '1', tenantId: 't1' }, { name: 'y' });
      expect(repo.delete).toHaveBeenCalledWith({ id: '1', tenantId: 't1' });
    });
  });
});
