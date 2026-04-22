import 'reflect-metadata';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.ORDER_SERVICE_PORT ?? 3001;
  await app.listen(port, () => console.log(`[order-service] listening on :${port}`));
}

bootstrap();
