import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Tenants are the isolation boundary itself, not tenant-owned data, so the table has no RLS.
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  slug: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
