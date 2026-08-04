import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { CallsModule } from './modules/calls/calls.module.js';

@Module({
  imports: [AppFeaturesModule, ChannelsModule, GatewayModule, AuthModule, CallsModule],
})
export class AppModule {}
