import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ORDER_STATUSES = ['pending', 'preparing', 'served', 'paid', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: ORDER_STATUSES, enumName: 'order_status', default: 'pending' })
  status: OrderStatus;

  @Column({ name: 'customer_label', type: 'text', nullable: true })
  customerLabel: string | null;

  @Column({ name: 'total_cents', type: 'int' })
  totalCents: number;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
