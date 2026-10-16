import { Global, Module } from '@nestjs/common';
import { AppConfig, appConfig } from './config';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => appConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
