import {
  Controller,
  Get,
  Module,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import { SESSION_COOKIE_NAME } from '../src/auth/auth.constants';
import { Roles } from '../src/auth/decorators/roles.decorator';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { SessionAuthGuard } from '../src/auth/guards/session-auth.guard';
import { UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

// These routes exist ONLY inside the test application.
@Controller('__test/rbac')
@UseGuards(SessionAuthGuard, RolesGuard)
class RbacTestController {
  @Get('admin')
  @Roles(UserRole.ADMIN)
  adminOnly() {
    return { access: 'admin' };
  }

  @Get('shared')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  shared() {
    return { access: 'shared' };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [RbacTestController],
})
class RbacTestModule {}

describe('RBAC Authorization (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const createdUserIds: string[] = [];

  let adminCookie: string;
  let staffCookie: string;
  let staffUserId: string;

  // Create a real database-backed session.
  async function createSession(
    userId: string,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');

    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    await prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(
          Date.now() + 60 * 60 * 1000,
        ),
      },
    });

    return `${SESSION_COOKIE_NAME}=${token}`;
  }

  beforeAll(async () => {
    // Protect the development database.
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
        'RBAC E2E tests require the isolated test database.',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule,
        RbacTestModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    const admin = await prisma.user.create({
      data: {
        fullName: 'RBAC Test Admin',
        email: `rbac-admin-${randomUUID()}@example.test`,
        passwordHash: 'not-used-for-these-tests',
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    createdUserIds.push(admin.id);

    const staff = await prisma.user.create({
      data: {
        fullName: 'RBAC Test Staff',
        email: `rbac-staff-${randomUUID()}@example.test`,
        passwordHash: 'not-used-for-these-tests',
        role: UserRole.STAFF,
        isActive: true,
      },
    });

    createdUserIds.push(staff.id);
    staffUserId = staff.id;

    adminCookie = await createSession(admin.id);
    staffCookie = await createSession(staff.id);
  });

  afterAll(async () => {
    try {
      if (prisma && createdUserIds.length > 0) {
        // Session rows are removed by the FK cascade.
        await prisma.user.deleteMany({
          where: {
            id: { in: createdUserIds },
          },
        });
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('returns 401 without authentication', async () => {
    await request(app.getHttpServer())
      .get('/__test/rbac/admin')
      .expect(401);
  });

  it('returns 403 when Staff accesses an Admin route', async () => {
    await request(app.getHttpServer())
      .get('/__test/rbac/admin')
      .set('Cookie', staffCookie)
      .expect(403);
  });

  it('allows Admin on an Admin-only route', async () => {
    const response = await request(app.getHttpServer())
      .get('/__test/rbac/admin')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body).toEqual({
      access: 'admin',
    });
  });

  it('allows Staff on a shared route', async () => {
    await request(app.getHttpServer())
      .get('/__test/rbac/shared')
      .set('Cookie', staffCookie)
      .expect(200);
  });

  it('allows Admin on a shared route', async () => {
    await request(app.getHttpServer())
      .get('/__test/rbac/shared')
      .set('Cookie', adminCookie)
      .expect(200);
  });

  it('does not trust a client-supplied role header', async () => {
    await request(app.getHttpServer())
      .get('/__test/rbac/admin')
      .set('Cookie', staffCookie)
      .set('X-User-Role', 'ADMIN')
      .expect(403);
  });

  it('rejects a disabled Staff account', async () => {
    await prisma.user.update({
      where: { id: staffUserId },
      data: { isActive: false },
    });

    try {
      await request(app.getHttpServer())
        .get('/__test/rbac/shared')
        .set('Cookie', staffCookie)
        .expect(401);
    } finally {
      await prisma.user.update({
        where: { id: staffUserId },
        data: { isActive: true },
      });
    }
  });
});
