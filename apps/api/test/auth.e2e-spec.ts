import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  randomUUID,
  randomBytes,
  createHash,
} from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PasswordService } from '../src/auth/password.service';
import { UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { SESSION_COOKIE_NAME } from '../src/auth/auth.constants';

describe('Authentication API (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string | undefined;

  const origin = 'http://localhost:3000';
  const email = `e2e-${randomUUID()}@example.test`;
  const password = 'E2E-Only-Strong-Passphrase-2026!';


  async function createTestSession(
    overrides: {
      expiresAt?: Date;
      revokedAt?: Date | null;
    } = {},
  ): Promise<string> {
    if (!testUserId) {
      throw new Error('Test user has not been created');
    }

    const token = randomBytes(32).toString('base64url');

    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    await prisma.authSession.create({
      data: {
        userId: testUserId,
        tokenHash,
        expiresAt:
          overrides.expiresAt ??
          new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: overrides.revokedAt ?? null,
      },
    });

    return `${SESSION_COOKIE_NAME}=${token}`;
  }


  beforeAll(async () => {
    const databaseUrl = new URL(
      process.env.DATABASE_URL ?? '',
    );

    if (
      process.env.NODE_ENV !== 'test' ||
      databaseUrl.hostname !== '127.0.0.1' ||
      databaseUrl.port !== '5433' ||
      databaseUrl.pathname !== '/orderflow_test'
    ) {
      throw new Error(
        'E2E tests require the isolated test database.',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    configureApp(app);

    await app.init();

    prisma = app.get(PrismaService);
    const passwords = app.get(PasswordService);

    const user = await prisma.user.create({
      data: {
        fullName: 'E2E Test Admin',
        email,
        passwordHash: await passwords.hash(password),
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    testUserId = user.id;
  });

  afterAll(async () => {
    if (prisma && testUserId) {
      await prisma.user.delete({
        where: { id: testUserId },
      });
    }

    if (app) {
      await app.close();
    }
  });

  it('rejects login with an incorrect password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', origin)
      .send({
        email,
        password: 'incorrect-password',
      })
      .expect(401);
  });

  it('rejects requests from an untrusted origin', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'https://malicious.example')
      .send({
        email,
        password,
      })
      .expect(403);
  });

  it('rejects requests without a session', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);
  });

  it('supports login, current user and logout', async () => {
    const agent = request.agent(app.getHttpServer());

    // Login
    const login = await agent
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);

    expect(login.body.user.email).toBe(email);
    expect(login.body.user.role).toBe('ADMIN');
    expect(login.body).not.toHaveProperty('token');
    expect(login.headers['cache-control']).toBe('no-store');

    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HttpOnly'),
      ]),
    );

    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('SameSite=Lax'),
      ]),
    );

    // Access authenticated endpoint
    const me = await agent
      .get('/auth/me')
      .expect(200);

    expect(me.body.user.email).toBe(email);
    expect(me.headers['cache-control']).toBe('no-store');

    // Logout
    await agent
      .post('/auth/logout')
      .set('Origin', origin)
      .expect(200);

    // Confirm session is no longer accepted
    await agent
      .get('/auth/me')
      .expect(401);
  });


  it('rejects an expired session', async () => {
    const cookie = await createTestSession({
      expiresAt: new Date(Date.now() - 60_000),
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('rejects a revoked session', async () => {
    const cookie = await createTestSession({
      revokedAt: new Date(),
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('rejects a disabled user session', async () => {
    if (!testUserId) {
      throw new Error('Test user missing');
    }

    const userId = testUserId;
    const cookie = await createTestSession();

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    try {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookie)
        .expect(401);
    } finally {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: true },
      });
    }
  });

  it('rejects a malformed session token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=invalid`)
      .expect(401);
  });

  it('rejects invalid login input', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', origin)
      .send({
        email: 'invalid-email',
        password: '',
      })
      .expect(400);
  });

  it('rejects POST requests without a trusted origin', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: 'incorrect-password',
      })
      .expect(403);
  });

});
