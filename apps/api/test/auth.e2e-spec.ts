import {
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PasswordService } from '../src/auth/password.service';
import { UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentication API (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string | undefined;

  const origin = 'http://localhost:3000';
  const email = `e2e-${randomUUID()}@example.test`;
  const password = 'E2E-Only-Strong-Passphrase-2026!';

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

    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HttpOnly'),
      ]),
    );

    // Access authenticated endpoint
    const me = await agent
      .get('/auth/me')
      .expect(200);

    expect(me.body.user.email).toBe(email);

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
});
