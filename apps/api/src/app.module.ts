import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { AuthModule } from './modules/auth/auth.module';
import { TestModule } from './test/test.module';
import { CallsModule } from './modules/calls/calls.module.js';
import { GuestChannelsModule } from './modules/guest-channels/guest-channels.module.js';
import { ServersModule } from './modules/servers/server.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { UsersModule } from './modules/users/users.module';
import { AccountSettingsModule } from './modules/account-settings/account-settings.module';
import { FriendshipsModule } from './modules/friendships/friendships.module';
import { DmsModule } from './modules/dms/dms.module';

@Module({
  imports: [
    AppFeaturesModule,
    AuthModule,
    TestModule,
    ServersModule,
    CallsModule,
    GuestChannelsModule,
    UsersModule,
    CallsModule,
    AccountSettingsModule,
    FriendshipsModule,
    DmsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfOriginGuard,
    },
  ],
})
export class AppModule {}
