import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/refresh-token.entity';
import { User } from '../auth/user.entity';
import { dbConfig } from '../config';
import { Order } from '../orders/order.entity';
import { OrderItem } from '../orders/order-item.entity';
import { Product } from '../products/product.entity';
import { Tenant } from '../tenancy/tenant.entity';

export const ENTITIES = [Tenant, User, RefreshToken, Product, Order, OrderItem];

// The API only ever connects as the runtime role, which cannot bypass Row-Level Security.
// Schema changes are applied separately by the migration script using the owner role.
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const db = dbConfig('runtime');
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          database: db.database,
          username: db.user,
          password: db.password,
          entities: ENTITIES,
          synchronize: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
