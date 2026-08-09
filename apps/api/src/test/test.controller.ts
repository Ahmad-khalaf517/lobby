import { BadRequestException, Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, SupabaseAuthGuard } from '../common/guards/supabase-auth.guard';
import { SameUserGuard } from '../common/guards/same-user.guard';

@Controller('test')
export class TestController {
  @Get()
  @UseGuards(SupabaseAuthGuard)
  test(@Req() request: AuthenticatedRequest) {
    return {
      message: 'You are authenticated',
      userId: request.user.id,
      email: request.user.email,
    };
  }

  @Get('error')
  testError(): never {
    throw new BadRequestException({
      code: 'TEST_ERROR',
      message: 'This is a test error from the controller',
      error: 'Bad Request',
    });
  }

  @Get('users/:userId')
  @UseGuards(SupabaseAuthGuard, SameUserGuard)
  getUserResource(@Param('userId') userId: string, @Req() request: AuthenticatedRequest) {
    return {
      message: 'You are authorized to access this user',
      requestedUserId: userId,
      authenticatedUserId: request.user.id,
    };
  }
}
