import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from '../auth.service';
import { SESSION_COOKIE_NAME } from '../auth.constants';

type SessionContext = Awaited<
  ReturnType<AuthService['validateSession']>
>;

export type AuthenticatedRequest = Request & {
  auth: SessionContext;
};

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request>();

    const token: unknown =
      request.cookies?.[SESSION_COOKIE_NAME];

    if (typeof token !== 'string') {
      throw new UnauthorizedException(
        'Authentication required',
      );
    }

    const session =
      await this.authService.validateSession(token);

    (request as AuthenticatedRequest).auth = session;

    return true;
  }
}
