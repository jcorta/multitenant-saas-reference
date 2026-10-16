import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { OrdersController } from './orders.controller';
import { OrderItemsRepository, OrdersRepository, OrdersService } from './orders.service';

@Module({
  imports: [ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderItemsRepository],
})
export class OrdersModule {}
