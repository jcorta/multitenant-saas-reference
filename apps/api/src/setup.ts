import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfig } from './config';

// Shared by the real entry point and the integration tests so both run the same pipeline.
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      // Unknown properties (for example a client-supplied tenantId) are rejected, not ignored.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
