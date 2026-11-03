import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const prismaMock = {
    productCategory: {
      findUnique: jest.fn(),
    },
    product: {
      create: jest.fn(),
    },
  };

  const service = new ProductsService(
    prismaMock as unknown as PrismaService,
  );

  const createProductDto = {
    sku: 'BED-001',
    name: 'Cotton Bedsheet',
    description: 'Premium cotton double bedsheet',
    sellingPrice: '2500.00',
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
  };

  const activeCategory = {
    isActive: true,
  };

  const createdProduct = {
    id: 'product-123',
    sku: 'BED-001',
    name: 'Cotton Bedsheet',
    description: 'Premium cotton double bedsheet',
    sellingPrice: new Prisma.Decimal('2500.00'),
    categoryId: createProductDto.categoryId,
    archivedAt: null,
    createdAt: new Date('2026-11-01'),
    updatedAt: new Date('2026-11-01'),
    inventoryBalance: {
      quantityOnHand: 0,
      quantityReserved: 0,
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // --------------------------------------------------
  // SUCCESSFUL PRODUCT CREATION
  // --------------------------------------------------
  describe('create', () => {
    it('creates a product with an inventory balance', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(
        activeCategory,
      );

      prismaMock.product.create.mockResolvedValue(
        createdProduct,
      );

      const result = await service.create(createProductDto);

      expect(result).toEqual(createdProduct);

      expect(
        prismaMock.productCategory.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          id: createProductDto.categoryId,
        },
        select: {
          isActive: true,
        },
      });

      expect(
        prismaMock.product.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            sku: 'BED-001',
            name: 'Cotton Bedsheet',
            description: 'Premium cotton double bedsheet',
            sellingPrice: expect.any(Prisma.Decimal),

            category: {
              connect: {
                id: createProductDto.categoryId,
              },
            },

            inventoryBalance: {
              create: {
                quantityOnHand: 0,
                quantityReserved: 0,
              },
            },
          },
        }),
      );

      expect(result.inventoryBalance).toEqual({
        quantityOnHand: 0,
        quantityReserved: 0,
      });
    });

    // --------------------------------------------------
    // OPTIONAL DESCRIPTION
    // --------------------------------------------------
    it('sets description to null when not provided', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(
        activeCategory,
      );

      prismaMock.product.create.mockResolvedValue({
        ...createdProduct,
        description: null,
      });

      const result = await service.create({
        ...createProductDto,
        description: undefined,
      });

      expect(result.description).toBeNull();

      expect(
        prismaMock.product.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    // --------------------------------------------------
    // DECIMAL PRICE PRECISION
    // --------------------------------------------------
    it('uses Prisma Decimal for selling price', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(
        activeCategory,
      );

      prismaMock.product.create.mockResolvedValue(
        createdProduct,
      );

      await service.create({
        ...createProductDto,
        sellingPrice: '2500.05',
      });

      const createCall = (
        prismaMock.product.create as jest.Mock
      ).mock.calls[0][0] as {
        data: {
          sellingPrice: Prisma.Decimal;
        };
      };

      const price = createCall.data.sellingPrice;

      expect(price).toBeInstanceOf(Prisma.Decimal);
      expect(price.equals('2500.05')).toBe(true);
    });

    // --------------------------------------------------
    // CATEGORY VALIDATION
    // --------------------------------------------------
    it('rejects a nonexistent product category', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(
        null,
      );

      await expect(
        service.create(createProductDto),
      ).rejects.toThrow(NotFoundException);

      expect(
        prismaMock.product.create,
      ).not.toHaveBeenCalled();
    });

    it('rejects an inactive product category', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue({
        isActive: false,
      });

      await expect(
        service.create(createProductDto),
      ).rejects.toThrow(BadRequestException);

      expect(
        prismaMock.product.create,
      ).not.toHaveBeenCalled();
    });

    // --------------------------------------------------
    // DUPLICATE SKU VALIDATION
    // --------------------------------------------------
    it('rejects duplicate product SKUs', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(
        activeCategory,
      );

      const error =
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: '7.0.0',
          },
        );

      prismaMock.product.create.mockRejectedValue(
        error,
      );

      await expect(
        service.create(createProductDto),
      ).rejects.toThrow(ConflictException);
    });

    // --------------------------------------------------
    // DATABASE RELATION ERROR
    // --------------------------------------------------
    it('handles a missing category during product creation', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(
        activeCategory,
      );

      const error =
        new Prisma.PrismaClientKnownRequestError(
          'Required record not found',
          {
            code: 'P2025',
            clientVersion: '7.0.0',
          },
        );

      prismaMock.product.create.mockRejectedValue(
        error,
      );

      await expect(
        service.create(createProductDto),
      ).rejects.toThrow(NotFoundException);
    });

    // --------------------------------------------------
    // UNEXPECTED DATABASE ERRORS
    // --------------------------------------------------
    it('propagates unexpected database errors', async () => {
      prismaMock.productCategory.findUnique.mockResolvedValue(
        activeCategory,
      );

      const databaseError = new Error(
        'Database connection failed',
      );

      prismaMock.product.create.mockRejectedValue(
        databaseError,
      );

      await expect(
        service.create(createProductDto),
      ).rejects.toThrow('Database connection failed');
    });
  });
});
