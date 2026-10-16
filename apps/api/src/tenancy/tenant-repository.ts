import {
  DeepPartial,
  EntityTarget,
  FindManyOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { TenantContext } from './tenant-context';

/**
 * Base class for data access to tenant-owned tables. The tenant filter is applied here, once,
 * instead of in every query: reads merge the context tenant into the filter, inserts stamp it,
 * and the repository is only obtainable inside a tenant context. Row-Level Security independently
 * enforces the same rule in the database.
 */
export abstract class TenantRepository<E extends ObjectLiteral & { tenantId: string }> {
  protected constructor(private readonly target: EntityTarget<E>) {}

  protected get repo(): Repository<E> {
    return TenantContext.manager().getRepository(this.target);
  }

  private scoped(where: FindOptionsWhere<E> = {}): FindOptionsWhere<E> {
    // The context tenant is spread last so a caller-supplied tenantId can never override it.
    return { ...where, tenantId: TenantContext.tenantId() } as FindOptionsWhere<E>;
  }

  find(options: Omit<FindManyOptions<E>, 'where'> & { where?: FindOptionsWhere<E> } = {}) {
    return this.repo.find({ ...options, where: this.scoped(options.where) });
  }

  findAndCount(options: Omit<FindManyOptions<E>, 'where'> & { where?: FindOptionsWhere<E> } = {}) {
    return this.repo.findAndCount({ ...options, where: this.scoped(options.where) });
  }

  findOne(where: FindOptionsWhere<E>) {
    return this.repo.findOne({ where: this.scoped(where) });
  }

  count(where?: FindOptionsWhere<E>) {
    return this.repo.count({ where: this.scoped(where) });
  }

  save(data: DeepPartial<E>): Promise<E> {
    const entity = this.repo.create({ ...data, tenantId: TenantContext.tenantId() } as DeepPartial<E>);
    return this.repo.save(entity);
  }

  async update(where: FindOptionsWhere<E>, patch: DeepPartial<E>): Promise<number> {
    const { tenantId: _ignored, ...safePatch } = patch as Record<string, unknown>;
    const result = await this.repo.update(this.scoped(where), safePatch as never);
    return result.affected ?? 0;
  }

  async delete(where: FindOptionsWhere<E>): Promise<number> {
    const result = await this.repo.delete(this.scoped(where));
    return result.affected ?? 0;
  }
}
