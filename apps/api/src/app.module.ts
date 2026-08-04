import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [AppFeaturesModule, ChannelsModule, GatewayModule, AuthModule],
})
export class AppModule {}
