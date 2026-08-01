import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    // 'null' is the literal Origin a browser sends for a page opened via
    // file:// (e.g. shipped/socket-dev-console.html) — allowed alongside the
    // real frontend origin so that dev tool can call the REST API too. Same
    // reasoning as ChannelGateway's cors option: no cookies/secrets ride on
    // CORS here, "knowing the channel id" is this app's access-control model.
    origin: [process.env.CORS_ORIGIN ?? 'http://localhost:4200', 'http://127.0.0.1:5500', 'null'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
