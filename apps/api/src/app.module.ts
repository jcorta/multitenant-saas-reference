import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Public } from './auth/decorators';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { CsrfGuard } from './common/csrf.guard';
import { ConfigModule } from './config.module';
import { DatabaseModule } from './database/database.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [ConfigModule, DatabaseModule, TenancyModule, AuthModule, ProductsModule, OrdersModule],
  controllers: [HealthController],
  providers: [
    // Guards run in registration order: CSRF check, then authentication, then authorization.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
