import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { NotificationsService } from './notifications.service';

@UseGuards(SupabaseAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** The signed-in user's notifications, newest first. */
  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.notificationsService.listForUser(userId);
  }

  @Post('read-all')
  async markAllRead(@CurrentUser('id') userId: string) {
    await this.notificationsService.markAllRead(userId);
    return { message: 'Notifications marked as read' };
  }
}
