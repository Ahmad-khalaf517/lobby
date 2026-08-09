import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { UpdateUserProfileRequest, UploadUserAvatarRequest } from '@lobby/shared';
import { UpdateUserProfileRequestSchema, UploadUserAvatarRequestSchema } from '@lobby/shared';
import { SameUserGuard } from '../../common/guards/same-user.guard';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RegisteredUserGuard } from '../../common/guards/registered-user.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { UsersService } from './users.service';

@UseGuards(SupabaseAuthGuard, RegisteredUserGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('search')
  search(@Query('q') query: string = '') {
    return this.users.searchUsers(query);
  }

  // Any authenticated user can view a profile — display name/avatar/bio are
  // shown wherever that person shows up (member lists, messages, etc).
  @Get(':userId/profile')
  getProfile(@Param('userId') userId: string) {
    return this.users.getProfile(userId);
  }

  // :userId must be the caller's own id — SameUserGuard enforces that.
  @UseGuards(SameUserGuard)
  @Patch(':userId/profile')
  updateProfile(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateUserProfileRequestSchema)) body: UpdateUserProfileRequest,
  ) {
    return this.users.updateProfile(userId, body);
  }

  @UseGuards(SameUserGuard)
  @Post(':userId/profile/avatar')
  uploadAvatar(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UploadUserAvatarRequestSchema)) body: UploadUserAvatarRequest,
  ) {
    return this.users.uploadAvatar(userId, body);
  }

  @UseGuards(SameUserGuard)
  @Delete(':userId/profile/avatar')
  deleteAvatar(@Param('userId') userId: string) {
    return this.users.deleteAvatar(userId);
  }
}
