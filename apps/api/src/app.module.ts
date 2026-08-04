import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { AccountSettingsModule } from './modules/account-settings/account-settings.module';

@Module({
  imports: [
    AppFeaturesModule,
    ChannelsModule,
    GatewayModule,
    UserProfileModule,
    AccountSettingsModule,
  ],
})
export class AppModule {}
