import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { SESSION_COOKIE_NAME } from '../src/auth/auth.constants';
import { UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Product Categories API (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminCookie: string;
  let staffCookie: string;

  const origin = 'http://localhost:3000';
  const userIds: string[] = [];
  const categoryIds: string[] = [];

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
    // Never run these tests against development data.
    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      process.env.NODE_ENV !== 'test' ||
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '5433' ||
      url.pathname !== '/orderflow_test'
    ) {
      throw new Error(
        'Isolated test database is required',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    const admin = await prisma.user.create({
      data: {
        fullName: 'Catalog Test Admin',
        email: `catalog-admin-${randomUUID()}@example.test`,
        passwordHash: 'unused-test-password-hash',
        role: UserRole.ADMIN,
      },
    });

    userIds.push(admin.id);

    const staff = await prisma.user.create({
      data: {
        fullName: 'Catalog Test Staff',
        email: `catalog-staff-${randomUUID()}@example.test`,
        passwordHash: 'unused-test-password-hash',
        role: UserRole.STAFF,
      },
    });

    userIds.push(staff.id);

    adminCookie = await createSession(admin.id);
    staffCookie = await createSession(staff.id);

    // An inactive category should never appear in listing.
    const inactive = await prisma.productCategory.create({
      data: {
        name: `Inactive-${randomUUID()}`,
        isActive: false,
      },
    });

    categoryIds.push(inactive.id);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        if (categoryIds.length > 0) {
          await prisma.productCategory.deleteMany({
            where: { id: { in: categoryIds } },
          });
        }

        if (userIds.length > 0) {
          await prisma.user.deleteMany({
            where: { id: { in: userIds } },
          });
        }
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('allows Admin to create a category', async () => {
    const name = `Bedsheets-${randomUUID()}`;

    const response = await request(app.getHttpServer())
      .post('/product-categories')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({
        name,
        description: 'Bed linen products',
      })
      .expect(201);

    categoryIds.push(response.body.id);

    expect(response.body).toEqual(
      expect.objectContaining({
        name,
        description: 'Bed linen products',
        isActive: true,
      }),
    );

    const saved = await prisma.productCategory.findUnique({
      where: { id: response.body.id },
    });

    expect(saved?.name).toBe(name);
  });

  it('rejects duplicate category names', async () => {
    const name = `Duplicate-${randomUUID()}`;

    const existing = await prisma.productCategory.create({
      data: { name },
    });

    categoryIds.push(existing.id);

    await request(app.getHttpServer())
      .post('/product-categories')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ name })
      .expect(409);
  });

  it('rejects invalid category names', async () => {
    await request(app.getHttpServer())
      .post('/product-categories')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ name: '   ' })
      .expect(400);
  });

  it('denies Staff category creation', async () => {
    await request(app.getHttpServer())
      .post('/product-categories')
      .set('Origin', origin)
      .set('Cookie', staffCookie)
      .send({ name: 'Not Allowed' })
      .expect(403);
  });

  it('requires authentication for creation', async () => {
    await request(app.getHttpServer())
      .post('/product-categories')
      .set('Origin', origin)
      .send({ name: 'Not Allowed' })
      .expect(401);
  });

  it('rejects requests without trusted origin', async () => {
    await request(app.getHttpServer())
      .post('/product-categories')
      .set('Cookie', adminCookie)
      .send({ name: 'Not Allowed' })
      .expect(403);
  });

  it('ignores client-supplied Admin role', async () => {
    await request(app.getHttpServer())
      .post('/product-categories')
      .set('Origin', origin)
      .set('Cookie', staffCookie)
      .set('X-User-Role', 'ADMIN')
      .send({ name: 'Not Allowed' })
      .expect(403);
  });

  it('allows Staff to list active categories', async () => {
    const response = await request(app.getHttpServer())
      .get('/product-categories?page=1&limit=50')
      .set('Cookie', staffCookie)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    expect(
      response.body.data.every(
        (category: { isActive: boolean }) =>
          category.isActive === true,
      ),
    ).toBe(true);

    const activeCount = await prisma.productCategory.count({
      where: { isActive: true },
    });

    expect(response.body.meta.total).toBe(activeCount);
    expect(response.body.meta.page).toBe(1);
  });

  it('rejects invalid pagination', async () => {
    await request(app.getHttpServer())
      .get('/product-categories?page=0&limit=100')
      .set('Cookie', adminCookie)
      .expect(400);
  });


  it('allows Admin to list inactive categories', async () => {
    const response = await request(app.getHttpServer())
      .get('/product-categories?status=inactive')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);

    expect(
      response.body.data.every(
        (category: { isActive: boolean }) =>
          category.isActive === false,
      ),
    ).toBe(true);

    const inactiveCount = await prisma.productCategory.count({
      where: { isActive: false },
    });

    expect(response.body.meta.total).toBe(inactiveCount);
    expect(inactiveCount).toBeGreaterThan(0);
  });

  it('allows Admin to list all categories', async () => {
    const response = await request(app.getHttpServer())
      .get('/product-categories?status=all')
      .set('Cookie', adminCookie)
      .expect(200);

    const total = await prisma.productCategory.count();

    expect(response.body.meta.total).toBe(total);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it('allows Staff to explicitly list active categories', async () => {
    const response = await request(app.getHttpServer())
      .get('/product-categories?status=active')
      .set('Cookie', staffCookie)
      .expect(200);

    expect(
      response.body.data.every(
        (category: { isActive: boolean }) =>
          category.isActive === true,
      ),
    ).toBe(true);
  });

  it('denies Staff access to inactive categories', async () => {
    await request(app.getHttpServer())
      .get('/product-categories?status=inactive')
      .set('Cookie', staffCookie)
      .expect(403);
  });

  it('denies Staff access to all-category listing', async () => {
    await request(app.getHttpServer())
      .get('/product-categories?status=all')
      .set('Cookie', staffCookie)
      .expect(403);
  });

  it('rejects invalid category status filters', async () => {
    await request(app.getHttpServer())
      .get('/product-categories?status=deleted')
      .set('Cookie', adminCookie)
      .expect(400);
  });


  it('allows Admin to deactivate a category', async () => {
    const category = await prisma.productCategory.create({
      data: {
        name: `Deactivate-${randomUUID()}`,
      },
    });

    categoryIds.push(category.id);

    const endpoint =
      `/product-categories/${category.id}/deactivate`;

    const first = await request(app.getHttpServer())
      .patch(endpoint)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(first.body.isActive).toBe(false);

    const second = await request(app.getHttpServer())
      .patch(endpoint)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(second.body.isActive).toBe(false);
    expect(second.body.updatedAt).toBe(first.body.updatedAt);

    const saved = await prisma.productCategory.findUnique({
      where: { id: category.id },
    });

    expect(saved?.isActive).toBe(false);
  });

  it('allows Admin to reactivate an inactive category', async () => {
    const category = await prisma.productCategory.create({
      data: {
        name: `Reactivate-${randomUUID()}`,
        isActive: false,
      },
    });

    categoryIds.push(category.id);

    const activeCountBefore =
      await prisma.productCategory.count({
        where: { isActive: true },
      });

    const endpoint =
      `/product-categories/${category.id}/activate`;

    const first = await request(app.getHttpServer())
      .patch(endpoint)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(first.body.isActive).toBe(true);

    // Repeating activation should not change the timestamp.
    const second = await request(app.getHttpServer())
      .patch(endpoint)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(second.body.isActive).toBe(true);
    expect(second.body.updatedAt).toBe(first.body.updatedAt);

    const activeList = await request(app.getHttpServer())
      .get('/product-categories?status=active')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(activeList.body.meta.total).toBe(
      activeCountBefore + 1,
    );

    const saved = await prisma.productCategory.findUnique({
      where: { id: category.id },
    });

    expect(saved?.isActive).toBe(true);
  });

  it('denies Staff category reactivation', async () => {
    const category = await prisma.productCategory.create({
      data: {
        name: `Staff-Reactivation-${randomUUID()}`,
        isActive: false,
      },
    });

    categoryIds.push(category.id);

    await request(app.getHttpServer())
      .patch(`/product-categories/${category.id}/activate`)
      .set('Origin', origin)
      .set('Cookie', staffCookie)
      .expect(403);

    const saved = await prisma.productCategory.findUnique({
      where: { id: category.id },
    });

    expect(saved?.isActive).toBe(false);
  });

});
