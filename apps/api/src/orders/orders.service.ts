import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { In } from 'typeorm';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { Page, toPage } from '../common/pagination';
import { ProductsRepository } from '../products/products.service';
import { TenantRepository } from '../tenancy/tenant-repository';
import { CreateOrderDto, ListOrdersDto, UpdateOrderDto } from './order.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { canTransition, mergeLines, orderTotal } from './order-rules';

@Injectable()
export class OrdersRepository extends TenantRepository<Order> {
  constructor() {
    super(Order);
  }
}

@Injectable()
export class OrderItemsRepository extends TenantRepository<OrderItem> {
  constructor() {
    super(OrderItem);
  }
}

export type OrderView = Order & { items: OrderItem[] };

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly items: OrderItemsRepository,
    private readonly products: ProductsRepository,
  ) {}

  async list(query: ListOrdersDto): Promise<Page<OrderView>> {
    const [orders, total] = await this.orders.findAndCount({
      where: query.status ? { status: query.status } : undefined,
      order: { createdAt: 'DESC', id: 'ASC' },
      take: query.limit,
      skip: query.offset,
    });
    return toPage(await this.withItems(orders), total, query);
  }

  async get(id: string): Promise<OrderView> {
    const order = await this.orders.findOne({ id });
    if (!order) throw new NotFoundException('Order not found');
    return (await this.withItems([order]))[0];
  }

  async create(dto: CreateOrderDto, user: AuthenticatedUser): Promise<OrderView> {
    const lines = mergeLines(dto.items);
    const products = await this.products.find({ where: { id: In(lines.map((l) => l.productId)) } });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Products of other tenants are invisible here, so they are reported like unknown ones.
    const unavailable = lines.filter((l) => !byId.get(l.productId)?.active);
    if (unavailable.length > 0) {
      throw new UnprocessableEntityException('One or more products are unknown or inactive');
    }

    const priced = lines.map((l) => {
      const product = byId.get(l.productId)!;
      return {
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: l.quantity,
      };
    });
    const order = await this.orders.save({
      customerLabel: dto.customerLabel ?? null,
      totalCents: orderTotal(priced),
      createdBy: user.userId,
    });
    for (const line of priced) await this.items.save({ ...line, orderId: order.id });
    return this.get(order.id);
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderView> {
    const order = await this.orders.findOne({ id });
    if (!order) throw new NotFoundException('Order not found');

    if (dto.status && !canTransition(order.status, dto.status)) {
      throw new ConflictException(`Cannot change status from ${order.status} to ${dto.status}`);
    }
    if (Object.keys(dto).length > 0) await this.orders.update({ id }, dto);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const affected = await this.orders.delete({ id });
    if (affected === 0) throw new NotFoundException('Order not found');
  }

  private async withItems(orders: Order[]): Promise<OrderView[]> {
    if (orders.length === 0) return [];
    const items = await this.items.find({ where: { orderId: In(orders.map((o) => o.id)) } });
    return orders.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
  }
}
