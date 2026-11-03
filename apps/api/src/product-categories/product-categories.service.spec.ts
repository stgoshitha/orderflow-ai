import { ConflictException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductCategoriesService } from './product-categories.service';

describe('ProductCategoriesService', () => {
  const prismaMock = {
    productCategory: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const service = new ProductCategoriesService(
    prismaMock as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates a product category', async () => {
    const category = {
      id: 'category-123',
      name: 'Bedsheets',
      description: 'Bed linen products',
      isActive: true,
    };

    prismaMock.productCategory.create.mockResolvedValue(
      category,
    );

    const result = await service.create({
      name: 'Bedsheets',
      description: 'Bed linen products',
    });

    expect(result).toEqual(category);

    expect(
      prismaMock.productCategory.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Bedsheets',
          description: 'Bed linen products',
        },
      }),
    );
  });

  it('rejects duplicate category names', async () => {
    const error =
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.0.0',
        },
      );

    prismaMock.productCategory.create.mockRejectedValue(
      error,
    );

    await expect(
      service.create({ name: 'Bedsheets' }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns paginated active categories', async () => {
    const categories = [
      {
        id: 'category-123',
        name: 'Bedsheets',
        isActive: true,
      },
    ];

    prismaMock.$transaction.mockResolvedValue([
      categories,
      1,
    ]);

    const result = await service.findAll({
      page: 1,
      limit: 20,
    });

    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    expect(result.data).toEqual(categories);

    expect(
      prismaMock.productCategory.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        skip: 0,
        take: 20,
      }),
    );
  });
});
