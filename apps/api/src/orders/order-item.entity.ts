import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column({ name: 'product_id' })
  productId: string;

  // Name and price are snapshotted so later catalogue edits do not rewrite order history.
  @Column({ name: 'product_name' })
  productName: string;

  @Column({ name: 'unit_price_cents', type: 'int' })
  unitPriceCents: number;

  @Column({ type: 'int' })
  quantity: number;
}
