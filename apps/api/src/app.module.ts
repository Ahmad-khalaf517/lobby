import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { AccountSettingsModule } from './modules/account-settings/account-settings.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    AppFeaturesModule,
    ChannelsModule,
    GatewayModule,
    UserProfileModule,
    AccountSettingsModule,
    AuthModule,
  ],
})
export class AppModule {}
