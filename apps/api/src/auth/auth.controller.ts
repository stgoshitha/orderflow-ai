import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import type { AuthenticatedRequest } from './guards/session-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private getCookieOptions() {
    return {
      httpOnly: true,
      secure:
        this.config.getOrThrow<string>('NODE_ENV') ===
        'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      dto.email,
      dto.password,
    );

    response.cookie(
      SESSION_COOKIE_NAME,
      result.token,
      {
        ...this.getCookieOptions(),
        maxAge: Math.max(
          0,
          result.expiresAt.getTime() - Date.now(),
        ),
      },
    );

    return {
      user: result.user,
      expiresAt: result.expiresAt,
    };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  getCurrentUser(
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      user: request.auth.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.revokeSession(
      request.auth.sessionId,
    );

    response.clearCookie(
      SESSION_COOKIE_NAME,
      this.getCookieOptions(),
    );

    return {
      message: 'Logged out successfully',
    };
  }
}
