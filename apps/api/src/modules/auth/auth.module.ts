import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DatabaseModule } from '../database/database.module';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthGuard],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
