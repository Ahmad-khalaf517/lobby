import { Module } from '@nestjs/common';
import { AppFeaturesModule } from './modules/app/app-features.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { TestModule } from './test/test.module';
import { CallsModule } from './modules/calls/calls.module.js';
import { ServersModule } from './modules/servers/server.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { APP_FILTER } from '@nestjs/core';
import { UsersModule } from './modules/users/users.module';
import { FriendshipsModule } from './modules/friendships/friendships.module';
import { DmsModule } from './modules/dms/dms.module';

@Module({
  imports: [
    AppFeaturesModule,
    ChannelsModule,
    GatewayModule,
    AuthModule,
    TestModule,
    ServersModule,
    UsersModule,
    CallsModule,
    FriendshipsModule,
    DmsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
