import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChannelGateway } from './channel.gateway';

@Module({
  imports: [DatabaseModule],
  providers: [ChannelGateway],
})
export class GatewayModule {}
