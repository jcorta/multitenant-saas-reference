import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Page, PaginationDto, toPage } from '../common/pagination';
import { TenantRepository } from '../tenancy/tenant-repository';
import { CreateProductDto, UpdateProductDto } from './product.dto';
import { Product } from './product.entity';

const FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class ProductsRepository extends TenantRepository<Product> {
  constructor() {
    super(Product);
  }
}

@Injectable()
export class ProductsService {
  constructor(private readonly products: ProductsRepository) {}

  async list(page: PaginationDto): Promise<Page<Product>> {
    const [items, total] = await this.products.findAndCount({
      order: { createdAt: 'ASC', id: 'ASC' },
      take: page.limit,
      skip: page.offset,
    });
    return toPage(items, total, page);
  }

  async get(id: string): Promise<Product> {
    const product = await this.products.findOne({ id });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  create(dto: CreateProductDto): Promise<Product> {
    return this.products.save(dto);
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    if (Object.keys(dto).length > 0) {
      const affected = await this.products.update({ id }, dto);
      if (affected === 0) throw new NotFoundException('Product not found');
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    try {
      const affected = await this.products.delete({ id });
      if (affected === 0) throw new NotFoundException('Product not found');
    } catch (err) {
      // Order history references the product; deactivating it is the supported alternative.
      if (err instanceof QueryFailedError && err.driverError?.code === FOREIGN_KEY_VIOLATION) {
        throw new ConflictException('Product is referenced by orders; set active=false instead');
      }
      throw err;
    }
  }
}
