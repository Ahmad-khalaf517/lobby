import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UserProfileController } from './user-profile.controller';
import { UserProfileRepository } from './user-profile.repository';
import { UserProfileService } from './user-profile.service';

@Module({
  imports: [DatabaseModule],
  controllers: [UserProfileController],
  providers: [UserProfileRepository, UserProfileService],
})
export class UserProfileModule {}
