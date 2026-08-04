import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UpdateUserProfileRequestSchema } from '@lobby/shared';
import { UserProfileService } from './user-profile.service';

@Controller('users/:userId/profile')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  find(@Param('userId') userId: string) {
    return this.userProfileService.findProfile(userId);
  }

  @Patch()
  update(@Param('userId') userId: string, @Body() body: unknown) {
    const payload = UpdateUserProfileRequestSchema.parse(body);
    return this.userProfileService.updateProfile(userId, payload);
  }
}
