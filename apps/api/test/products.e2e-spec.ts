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
import { Prisma } from '../src/generated/prisma/client';
import { UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Product Creation API (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminCookie: string;
  let staffCookie: string;
  let activeCategoryId: string;
  let inactiveCategoryId: string;

  const origin = 'http://localhost:3000';
  const userIds: string[] = [];
  const categoryIds: string[] = [];

  // Unique namespace isolates records belonging to this suite.
  const suiteId = randomUUID()
    .replace(/-/g, '')
    .slice(0, 12)
    .toUpperCase();

  const skuPrefix = `E2E-${suiteId}-`;

  const makeSku = () =>
    `${skuPrefix}${randomBytes(4).toString('hex').toUpperCase()}`;

  function productPayload(sku = makeSku()) {
    return {
      sku,
      name: 'Cotton Bedsheet',
      description: 'Premium cotton double bedsheet',
      sellingPrice: '2500.05',
      categoryId: activeCategoryId,
    };
  }

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
    // Never execute these tests against the development DB.
    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      process.env.NODE_ENV !== 'test' ||
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '5433' ||
      url.pathname !== '/orderflow_test'
    ) {
      throw new Error(
        'Product E2E tests require the isolated test database.',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    // Create a temporary Admin account.
    const admin = await prisma.user.create({
      data: {
        fullName: 'Product Test Admin',
        email: `product-admin-${randomUUID()}@example.test`,
        passwordHash: 'unused-test-hash',
        role: UserRole.ADMIN,
      },
    });

    userIds.push(admin.id);

    // Create a temporary Staff account.
    const staff = await prisma.user.create({
      data: {
        fullName: 'Product Test Staff',
        email: `product-staff-${randomUUID()}@example.test`,
        passwordHash: 'unused-test-hash',
        role: UserRole.STAFF,
      },
    });

    userIds.push(staff.id);

    adminCookie = await createSession(admin.id);
    staffCookie = await createSession(staff.id);

    // Active category for successful product creation.
    const active = await prisma.productCategory.create({
      data: {
        name: `Active Product Category ${suiteId}`,
        isActive: true,
      },
    });

    activeCategoryId = active.id;
    categoryIds.push(active.id);

    // Inactive category for rejection testing.
    const inactive = await prisma.productCategory.create({
      data: {
        name: `Inactive Product Category ${suiteId}`,
        isActive: false,
      },
    });

    inactiveCategoryId = inactive.id;
    categoryIds.push(inactive.id);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        // Delete only products created by this test suite.
        const products = await prisma.product.findMany({
          where: {
            sku: {
              startsWith: skuPrefix,
            },
          },
          select: {
            id: true,
          },
        });

        const productIds = products.map(
          (product) => product.id,
        );

        if (productIds.length > 0) {
          // InventoryBalance uses onDelete: Restrict.
          // Remove dependent balances before products.
          await prisma.inventoryBalance.deleteMany({
            where: {
              productId: {
                in: productIds,
              },
            },
          });

          await prisma.product.deleteMany({
            where: {
              id: {
                in: productIds,
              },
            },
          });
        }

        if (categoryIds.length > 0) {
          await prisma.productCategory.deleteMany({
            where: {
              id: {
                in: categoryIds,
              },
            },
          });
        }

        if (userIds.length > 0) {
          await prisma.user.deleteMany({
            where: {
              id: {
                in: userIds,
              },
            },
          });
        }
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  // --------------------------------------------------
  // SUCCESSFUL PRODUCT CREATION
  // --------------------------------------------------
  it('allows Admin to create a product with zero inventory', async () => {
    const payload = productPayload();

    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        sku: payload.sku,
        name: payload.name,
        categoryId: activeCategoryId,
        archivedAt: null,
      }),
    );

    expect(response.body.inventoryBalance).toEqual({
      quantityOnHand: 0,
      quantityReserved: 0,
    });

    // Verify both records actually exist in PostgreSQL.
    const saved = await prisma.product.findUnique({
      where: {
        sku: payload.sku,
      },
      include: {
        inventoryBalance: true,
      },
    });

    expect(saved).not.toBeNull();
    expect(saved?.id).toBe(response.body.id);

    expect(saved?.inventoryBalance).toEqual(
      expect.objectContaining({
        productId: saved?.id,
        quantityOnHand: 0,
        quantityReserved: 0,
      }),
    );
  });

  // --------------------------------------------------
  // DECIMAL PRECISION
  // --------------------------------------------------
  it('preserves selling price precision', async () => {
    const payload = productPayload();

    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(201);

    const price = new Prisma.Decimal(
      String(response.body.sellingPrice),
    );

    expect(price.equals('2500.05')).toBe(true);

    const saved = await prisma.product.findUnique({
      where: { sku: payload.sku },
    });

    expect(
      saved?.sellingPrice.equals('2500.05'),
    ).toBe(true);
  });

  // --------------------------------------------------
  // DUPLICATE SKU
  // --------------------------------------------------
  it('rejects duplicate product SKUs', async () => {
    const payload = productPayload();

    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(201);

    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({
        ...payload,
        name: 'Another Bedsheet',
      })
      .expect(409);

    const products = await prisma.product.findMany({
      where: {
        sku: payload.sku,
      },
      include: {
        inventoryBalance: true,
      },
    });

    // The rejected request must not create another product.
    expect(products).toHaveLength(1);
    expect(products[0].inventoryBalance).not.toBeNull();
  });

  // --------------------------------------------------
  // CATEGORY VALIDATION
  // --------------------------------------------------
  it('rejects an inactive product category', async () => {
    const payload = {
      ...productPayload(),
      categoryId: inactiveCategoryId,
    };

    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(400);

    const count = await prisma.product.count({
      where: {
        sku: payload.sku,
      },
    });

    expect(count).toBe(0);
  });

  it('rejects a nonexistent category', async () => {
    const payload = {
      ...productPayload(),
      categoryId: randomUUID(),
    };

    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send(payload)
      .expect(404);

    expect(
      await prisma.product.count({
        where: { sku: payload.sku },
      }),
    ).toBe(0);
  });

  // --------------------------------------------------
  // AUTHORIZATION
  // --------------------------------------------------
  it('denies Staff product creation', async () => {
    const payload = productPayload();

    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', staffCookie)
      .send(payload)
      .expect(403);

    expect(
      await prisma.product.count({
        where: { sku: payload.sku },
      }),
    ).toBe(0);
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .send(productPayload())
      .expect(401);
  });

  // --------------------------------------------------
  // DTO VALIDATION
  // --------------------------------------------------
  it('rejects a price with more than two decimal places', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({
        ...productPayload(),
        sellingPrice: '2500.555',
      })
      .expect(400);
  });

  it('rejects an invalid SKU', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({
        ...productPayload(),
        sku: '!',
      })
      .expect(400);
  });

  it('rejects an invalid category UUID', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({
        ...productPayload(),
        categoryId: 'invalid-uuid',
      })
      .expect(400);
  });

  // --------------------------------------------------
  // REQUEST ORIGIN PROTECTION
  // --------------------------------------------------
  it('rejects POST requests without trusted origin', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Cookie', adminCookie)
      .send(productPayload())
      .expect(403);
  });
});
