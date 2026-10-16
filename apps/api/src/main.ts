import 'reflect-metadata';
import { config } from 'dotenv';
config({ quiet: true });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig } from './config';
import { configureApp } from './setup';

async function bootstrap() {
  const config = appConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app, config);
  await app.listen(config.port);
}

bootstrap();
