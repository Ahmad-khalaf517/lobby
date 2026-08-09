import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { SupabaseService } from '../modules/database/supabase.service';

@Module({
  controllers: [TestController],
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class TestModule {}
