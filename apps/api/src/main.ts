/* eslint-disable no-console */
import 'dotenv/config';

import cookieParser from 'cookie-parser';
import express from 'express';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { trustedOrigins } from './common/security/trusted-origins';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  app.use(cookieParser());

  const allowedOrigins = trustedOrigins();

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port, '0.0.0.0');

  console.log(`Lobby API running on port ${port}`);
  console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
}

void bootstrap();
