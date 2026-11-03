import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        fullName: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    const isValid =
      user?.isActive === true
        ? await this.passwords.verify(
            user.passwordHash,
            password,
          )
        : false;

    if (!user || !user.isActive || !isValid) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MS,
    );

    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  async validateSession(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new UnauthorizedException('Invalid session');
    }

    const session = await this.prisma.authSession.findUnique({
      where: {
        tokenHash: this.hashToken(token),
      },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException(
        'Invalid or expired session',
      );
    }

    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        name: session.user.fullName,
        email: session.user.email,
        role: session.user.role,
      },
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
