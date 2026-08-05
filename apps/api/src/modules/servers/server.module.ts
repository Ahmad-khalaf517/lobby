import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ServersController } from './servers.controller';
import { ServersRepository } from './servers.repository';
import { ServersService } from './servers.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ServersController],
  providers: [ServersRepository, ServersService],
  exports: [ServersService],
})
export class ServersModule {}
