import { Test } from '@nestjs/testing';
import { HealthService } from './health.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthService', () => {
  let service: HealthService;

  const prismaMock = {
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    prismaMock.$queryRaw.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = moduleRef.get(HealthService);
  });

  it('returns healthy when the database responds', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ result: 1 }]);

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails when the database query fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(service.check()).rejects.toThrow(
      'Database unavailable',
    );
  });
});
