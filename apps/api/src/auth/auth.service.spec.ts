import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const passwords = {
    verify: jest.fn(),
  };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
  );

  const user = {
    id: 'user-123',
    name: 'Test Admin',
    email: 'admin@example.com',
    passwordHash: 'stored-hash',
    role: 'ADMIN',
    isActive: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates a session for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(true);

    const result = await service.login(
      'ADMIN@example.com',
      'correct-password',
    );

    expect(result.user.email).toBe(user.email);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
      select: expect.any(Object),
    });

    const storedHash =
      prisma.authSession.create.mock.calls[0][0]
        .data.tokenHash;

    const expectedHash = createHash('sha256')
      .update(result.token)
      .digest('hex');

    expect(storedHash).toBe(expectedHash);
    expect(storedHash).not.toBe(result.token);
    expect(result.expiresAt.getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect password', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login('admin@example.com', 'wrong'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login('missing@example.com', 'password'),
    ).rejects.toThrow('Invalid email or password');

    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('rejects a disabled account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      isActive: false,
    });

    await expect(
      service.login(user.email, 'password'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.authSession.create).not.toHaveBeenCalled();
  });

  it('validates an active session', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-123',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });

    const result = await service.validateSession('a'.repeat(43));

    expect(result.sessionId).toBe('session-123');
    expect(result.user.email).toBe(user.email);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects an expired session', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-123',
      expiresAt: new Date(Date.now() - 60_000),
      revokedAt: null,
      user,
    });

    await expect(
      service.validateSession('a'.repeat(43)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a revoked session', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-123',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user,
    });

    await expect(
      service.validateSession('a'.repeat(43)),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed tokens without a database query', async () => {
    await expect(
      service.validateSession('invalid'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
  });

  it('revokes a session', async () => {
    prisma.authSession.updateMany.mockResolvedValue({
      count: 1,
    });

    await service.revokeSession('session-123');

    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-123',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });
});
