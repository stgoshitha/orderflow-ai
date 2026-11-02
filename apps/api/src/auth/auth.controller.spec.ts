import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './auth.constants';
import type { AuthenticatedRequest } from './guards/session-auth.guard';

describe('AuthController', () => {
  const authService = {
    login: jest.fn(),
    revokeSession: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('development'),
  };

  const controller = new AuthController(
    authService as unknown as AuthService,
    configService as unknown as ConfigService,
  );

  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets a secure-by-design session cookie on login', async () => {
    authService.login.mockResolvedValue({
      token: 'private-session-token',
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-123',
        role: 'ADMIN',
      },
    });

    const result = await controller.login(
      {
        email: 'admin@example.com',
        password: 'test-password',
      },
      response,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'private-session-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );

    expect(result).not.toHaveProperty('token');
  });

  it('revokes a session and clears the cookie', async () => {
    authService.revokeSession.mockResolvedValue(undefined);

    const request = {
      auth: {
        sessionId: 'session-123',
        user: {
          id: 'user-123',
          role: 'ADMIN',
        },
      },
    } as AuthenticatedRequest;

    await controller.logout(request, response);

    expect(authService.revokeSession).toHaveBeenCalledWith(
      'session-123',
    );

    expect(response.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        path: '/',
      }),
    );
  });
});
