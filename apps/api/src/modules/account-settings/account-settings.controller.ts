import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UpdateAccountSettingsRequestSchema } from '@lobby/shared';
import { AccountSettingsService } from './account-settings.service';

@Controller('users/:userId/account-settings')
export class AccountSettingsController {
  constructor(private readonly accountSettingsService: AccountSettingsService) {}

  @Get()
  find(@Param('userId') userId: string) {
    return this.accountSettingsService.findSettings(userId);
  }

  @Patch()
  update(@Param('userId') userId: string, @Body() body: unknown) {
    const payload = UpdateAccountSettingsRequestSchema.parse(body);
    return this.accountSettingsService.updateSettings(userId, payload);
  }
}
