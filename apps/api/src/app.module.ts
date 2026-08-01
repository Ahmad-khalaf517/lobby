import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChannelsModule } from './channels/channels.module';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [ChannelsModule, GatewayModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
