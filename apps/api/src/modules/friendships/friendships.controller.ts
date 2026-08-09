import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { BlockUserPayload, SendFriendRequestPayload } from '@lobby/shared';
import { BlockUserSchema, SendFriendRequestSchema } from '@lobby/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../../common/guards/supabase-auth.guard';
import { RegisteredUserGuard } from '../../common/guards/registered-user.guard';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { FriendshipsService } from './friendships.service';

@UseGuards(SupabaseAuthGuard, RegisteredUserGuard)
@Controller('friendships')
export class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  // -------------------------------------------------------------------
  // Requests
  // -------------------------------------------------------------------

  @Post('requests')
  sendRequest(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(SendFriendRequestSchema)) body: SendFriendRequestPayload,
  ) {
    return this.friendshipsService.sendFriendRequest(userId, body.addresseeId);
  }

  @Get('requests/incoming')
  listIncoming(@CurrentUser('id') userId: string) {
    return this.friendshipsService.listIncomingRequests(userId);
  }

  @Get('requests/outgoing')
  listOutgoing(@CurrentUser('id') userId: string) {
    return this.friendshipsService.listOutgoingRequests(userId);
  }

  @Post('requests/:friendshipId/accept')
  acceptRequest(@CurrentUser('id') userId: string, @Param('friendshipId') friendshipId: string) {
    return this.friendshipsService.acceptFriendRequest(userId, friendshipId);
  }

  /** Decline an incoming request, or cancel an outgoing one. */
  @Delete('requests/:friendshipId')
  removeRequest(@CurrentUser('id') userId: string, @Param('friendshipId') friendshipId: string) {
    return this.friendshipsService.removePendingRequest(userId, friendshipId);
  }

  // -------------------------------------------------------------------
  // Friends
  // -------------------------------------------------------------------

  @Get()
  listFriends(@CurrentUser('id') userId: string) {
    return this.friendshipsService.listFriends(userId);
  }

  @Delete(':friendshipId')
  removeFriend(@CurrentUser('id') userId: string, @Param('friendshipId') friendshipId: string) {
    return this.friendshipsService.removeFriend(userId, friendshipId);
  }

  // -------------------------------------------------------------------
  // Blocking
  // -------------------------------------------------------------------

  @Post('blocks')
  blockUser(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(BlockUserSchema)) body: BlockUserPayload,
  ) {
    return this.friendshipsService.blockUser(userId, body.userId);
  }

  @Get('blocks')
  listBlocked(@CurrentUser('id') userId: string) {
    return this.friendshipsService.listBlockedUsers(userId);
  }

  @Delete('blocks/:userId')
  unblockUser(@CurrentUser('id') userId: string, @Param('userId') targetUserId: string) {
    return this.friendshipsService.unblockUser(userId, targetUserId);
  }
}
