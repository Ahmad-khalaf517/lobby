import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { type AuthenticatedRequest, SupabaseAuthGuard } from '../modules/auth/supabase-auth.guard';

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
}
