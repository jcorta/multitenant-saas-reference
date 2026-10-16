import 'reflect-metadata';
import './load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfig } from './config';
import { configureApp } from './setup';

async function bootstrap() {
  const config = appConfig();
  const app = await NestFactory.create(AppModule);
  configureApp(app, config);
  // Close the HTTP server and the database pool on SIGTERM so container stops are graceful.
  app.enableShutdownHooks();
  await app.listen(config.port);
}

bootstrap();
