import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { AuthModule } from './modules/auth/auth.module';
import { TestModule } from './test/test.module';
import { CallsModule } from './modules/calls/calls.module.js';
import { ServersModule } from './modules/servers/server.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { APP_FILTER } from '@nestjs/core';
import { UsersModule } from './modules/users/users.module';
import { AccountSettingsModule } from './modules/account-settings/account-settings.module';
import { FriendshipsModule } from './modules/friendships/friendships.module';
import { DmsModule } from './modules/dms/dms.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChannelMessagesModule } from './modules/channel-messages/channel-messages.module';

@Module({
  imports: [
    AppFeaturesModule,
    AuthModule,
    TestModule,
    ServersModule,
    UsersModule,
    CallsModule,
    AccountSettingsModule,
    FriendshipsModule,
    DmsModule,
    NotificationsModule,
    ChannelMessagesModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
