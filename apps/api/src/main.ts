/* eslint-disable no-console */
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins =
    'http://localhost:4200,http://127.0.0.1:4200,http://127.0.0.1:5500,http://localhost:5500,https://lobby-hub.vercel.app'
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port, '0.0.0.0');

  console.log(`Lobby API running on port ${port}`);
  console.log(`Allowed CORS origins: ${allowedOrigins.join(', ')}`);
}

void bootstrap();
