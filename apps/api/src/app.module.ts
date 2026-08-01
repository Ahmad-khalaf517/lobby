import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { GatewayModule } from './modules/gateway/gateway.module';

@Module({
  imports: [AppFeaturesModule, ChannelsModule, GatewayModule],
})
export class AppModule {}
