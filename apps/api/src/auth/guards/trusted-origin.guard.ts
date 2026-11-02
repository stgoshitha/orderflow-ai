import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request>();

    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const trustedOrigin = new URL(
      this.config.getOrThrow<string>('FRONTEND_ORIGIN'),
    ).origin;

    let sourceOrigin = request.headers.origin;

    if (!sourceOrigin && request.headers.referer) {
      try {
        sourceOrigin = new URL(
          request.headers.referer,
        ).origin;
      } catch {
        throw new ForbiddenException(
          'Untrusted request origin',
        );
      }
    }

    if (sourceOrigin !== trustedOrigin) {
      throw new ForbiddenException(
        'Untrusted request origin',
      );
    }

    return true;
  }
}
