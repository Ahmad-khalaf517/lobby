import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { TestModule } from './test/test.module';

@Module({
  imports: [AppFeaturesModule, ChannelsModule, GatewayModule, AuthModule, TestModule],
})
export class AppModule {}
