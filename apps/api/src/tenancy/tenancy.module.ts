import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantRunner } from './tenant-runner.service';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor';

@Global()
@Module({
  providers: [TenantRunner, { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor }],
  exports: [TenantRunner],
})
export class TenancyModule {}
