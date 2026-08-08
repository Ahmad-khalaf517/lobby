import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ServerMembersRepository } from './server-members.repository';
import { ServerMembersService } from './server-members.service';

@Module({
  imports: [DatabaseModule],
  providers: [ServerMembersRepository, ServerMembersService],
  exports: [ServerMembersService],
})
export class ServerMembersModule {}
