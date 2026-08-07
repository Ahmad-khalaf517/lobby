import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { AccountSetting, UpdateAccountSettingsRequest } from '@lobby/shared';
import { UpdateAccountSettingsRequestSchema } from '@lobby/shared';
import { SameUserGuard } from '../../common/guards/same-user.guard';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { AccountSettingsService } from './account-settings.service';

@UseGuards(SupabaseAuthGuard, SameUserGuard)
@Controller('users/:userId/account-settings')
export class AccountSettingsController {
  constructor(private readonly accountSettings: AccountSettingsService) {}

  @Get()
  getSettings(@Param('userId') userId: string): Promise<AccountSetting[]> {
    return this.accountSettings.getSettingsForUser(userId);
  }

  @Patch()
  updateSettings(
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateAccountSettingsRequestSchema))
    body: UpdateAccountSettingsRequest,
  ): Promise<AccountSetting[]> {
    return this.accountSettings.updateSettingsForUser(userId, body);
  }
}
