import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { ChannelRepository } from './channel.repository';

@Module({
  providers: [SupabaseService, ChannelRepository],
  exports: [ChannelRepository],
})
export class DatabaseModule {}
