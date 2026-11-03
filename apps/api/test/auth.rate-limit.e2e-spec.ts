
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Authentication Rate Limiting (E2E)', () => {
  let app: INestApplication;

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
        'Rate-limit tests require the isolated test database',
      );
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    configureApp(app);

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns 429 after five login attempts', async () => {
    const httpServer = app.getHttpServer();

    for (let attempt = 1; attempt <= 6; attempt++) {
      const response = await request(httpServer)
        .post('/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: 'nonexistent-rate-limit@example.test',
          password: 'Incorrect-Test-Password',
        });

      const expectedStatus =
        attempt <= 5 ? 401 : 429;

      expect(response.status).toBe(expectedStatus);
    }
  });
});
