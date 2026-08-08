import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ServersController } from './servers.controller';
import { ServersRepository } from './servers.repository';
import { ServersService } from './servers.service';
import { ChannelModule } from '../channels/channel.module';
import { ServerMembersModule } from '../server-members/server-members.module';

@Module({
  imports: [DatabaseModule, ChannelModule, ServerMembersModule],
  controllers: [ServersController],
  providers: [ServersRepository, ServersService],
  exports: [ServersService],
})
export class ServersModule {}
