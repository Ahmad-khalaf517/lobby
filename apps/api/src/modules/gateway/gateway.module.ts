import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ChannelGateway } from './channel.gateway';

@Module({
  imports: [ChannelsModule],
  providers: [ChannelGateway],
})
export class GatewayModule {}
