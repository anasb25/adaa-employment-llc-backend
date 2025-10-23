import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@rovinghut/nestjs-auth';
import { CurrentUser } from './common/decorators/current-user.decorator.js';
import type { User } from '@rovinghut/nestjs-auth';

@Controller('protected')
export class ProtectedController {
  @Get()
  @UseGuards(AuthGuard)
  getProtected(@CurrentUser() user: User) {
    return {
      message: 'This is a protected resource',
      user: {
        sub: user.sub,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }
}
