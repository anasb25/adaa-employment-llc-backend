import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@rovinghut/nestjs-auth';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
