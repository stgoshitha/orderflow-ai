
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ProductCategoriesService } from './product-categories.service';

describe('ProductCategoriesService', () => {
  const prismaMock = {
    productCategory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const service = new ProductCategoriesService(
    prismaMock as unknown as PrismaService,
  );

  const category = {
    id: 'category-123',
    name: 'Bedsheets',
    description: 'Bed linen products',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // --------------------------------------------------
  // CREATE PRODUCT CATEGORY
  // --------------------------------------------------
  describe('create', () => {
    it('creates a product category', async () => {
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

    it('creates a category without a description', async () => {
      prismaMock.productCategory.create.mockResolvedValue({
        ...category,
        description: null,
      });

      await service.create({
        name: 'Bedsheets',
      });

      expect(
        prismaMock.productCategory.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Bedsheets',
            description: null,
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
        service.create({
          name: 'Bedsheets',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // --------------------------------------------------
  // LIST PRODUCT CATEGORIES
  // --------------------------------------------------
  describe('findAll', () => {
    it('returns paginated active categories', async () => {
      const categories = [category];

      prismaMock.$transaction.mockResolvedValue([
        categories,
        1,
      ]);

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
          status: 'active',
        },
        UserRole.ADMIN,
      );

      expect(result.data).toEqual(categories);

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });

      expect(
        prismaMock.productCategory.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
          },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('allows Admin to list inactive categories', async () => {
      const inactiveCategory = {
        ...category,
        isActive: false,
      };

      prismaMock.$transaction.mockResolvedValue([
        [inactiveCategory],
        1,
      ]);

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
          status: 'inactive',
        },
        UserRole.ADMIN,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isActive).toBe(false);

      expect(
        prismaMock.productCategory.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: false,
          },
        }),
      );
    });

    it('allows Admin to list all categories', async () => {
      prismaMock.$transaction.mockResolvedValue([
        [category],
        1,
      ]);

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
          status: 'all',
        },
        UserRole.ADMIN,
      );

      expect(result.meta.total).toBe(1);

      expect(
        prismaMock.productCategory.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('allows Staff to list active categories', async () => {
      prismaMock.$transaction.mockResolvedValue([
        [category],
        1,
      ]);

      const result = await service.findAll(
        {
          page: 1,
          limit: 20,
          status: 'active',
        },
        UserRole.STAFF,
      );

      expect(result.data).toHaveLength(1);

      expect(
        prismaMock.productCategory.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
          },
        }),
      );
    });

    it('prevents Staff from viewing inactive categories', async () => {
      await expect(
        service.findAll(
          {
            page: 1,
            limit: 20,
            status: 'inactive',
          },
          UserRole.STAFF,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(
        prismaMock.$transaction,
      ).not.toHaveBeenCalled();
    });

    it('prevents Staff from viewing all categories', async () => {
      await expect(
        service.findAll(
          {
            page: 1,
            limit: 20,
            status: 'all',
          },
          UserRole.STAFF,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(
        prismaMock.$transaction,
      ).not.toHaveBeenCalled();
    });

    it('calculates pagination metadata correctly', async () => {
      prismaMock.$transaction.mockResolvedValue([
        [category],
        45,
      ]);

      const result = await service.findAll(
        {
          page: 2,
          limit: 10,
          status: 'active',
        },
        UserRole.ADMIN,
      );

      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 45,
        totalPages: 5,
      });

      expect(
        prismaMock.productCategory.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  // --------------------------------------------------
  // UPDATE PRODUCT CATEGORY
  // --------------------------------------------------
  describe('update', () => {
    it('updates category details', async () => {
      const updatedCategory = {
        ...category,
        name: 'Premium Bedsheets',
        description: 'Premium quality bedsheets',
      };

      prismaMock.productCategory.update.mockResolvedValue(
        updatedCategory,
      );

      const result = await service.update(
        category.id,
        {
          name: 'Premium Bedsheets',
          description: 'Premium quality bedsheets',
        },
      );

      expect(result).toEqual(updatedCategory);

      expect(
        prismaMock.productCategory.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: category.id,
          },
          data: {
            name: 'Premium Bedsheets',
            description: 'Premium quality bedsheets',
          },
        }),
      );
    });

    it('updates only the provided fields', async () => {
      prismaMock.productCategory.update.mockResolvedValue({
        ...category,
        name: 'Premium Bedsheets',
      });

      await service.update(category.id, {
        name: 'Premium Bedsheets',
      });

      expect(
        prismaMock.productCategory.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Premium Bedsheets',
          },
        }),
      );
    });

    it('allows clearing the category description', async () => {
      prismaMock.productCategory.update.mockResolvedValue({
        ...category,
        description: null,
      });

      await service.update(category.id, {
        description: null,
      });

      expect(
        prismaMock.productCategory.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            description: null,
          },
        }),
      );
    });

    it('rejects an empty update request', async () => {
      await expect(
        service.update(category.id, {}),
      ).rejects.toThrow(BadRequestException);

      expect(
        prismaMock.productCategory.update,
      ).not.toHaveBeenCalled();
    });

    it('rejects duplicate category names during update', async () => {
      const error =
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: '7.0.0',
          },
        );

      prismaMock.productCategory.update.mockRejectedValue(
        error,
      );

      await expect(
        service.update(category.id, {
          name: 'Existing Category',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns 404 when updating a missing category', async () => {
      const error =
        new Prisma.PrismaClientKnownRequestError(
          'Record not found',
          {
            code: 'P2025',
            clientVersion: '7.0.0',
          },
        );

      prismaMock.productCategory.update.mockRejectedValue(
        error,
      );

      await expect(
        service.update('missing-category', {
          name: 'Bedsheets',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // --------------------------------------------------
  // DEACTIVATE PRODUCT CATEGORY
  // --------------------------------------------------
  describe('deactivate', () => {
    it('deactivates an active category', async () => {
      prismaMock.productCategory.updateMany.mockResolvedValue({
        count: 1,
      });

      prismaMock.productCategory.findUnique.mockResolvedValue({
        ...category,
        isActive: false,
      });

      const result = await service.deactivate(category.id);

      expect(result.isActive).toBe(false);

      expect(
        prismaMock.productCategory.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: category.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
    });

    it('handles repeated deactivation', async () => {
      prismaMock.productCategory.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.productCategory.findUnique.mockResolvedValue({
        ...category,
        isActive: false,
      });

      const result = await service.deactivate(category.id);

      expect(result.isActive).toBe(false);

      expect(
        prismaMock.productCategory.updateMany,
      ).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when deactivating a missing category', async () => {
      prismaMock.productCategory.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.productCategory.findUnique.mockResolvedValue(
        null,
      );

      await expect(
        service.deactivate('missing-category'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // --------------------------------------------------
  // REACTIVATE PRODUCT CATEGORY
  // --------------------------------------------------
  describe('activate', () => {
    it('reactivates an inactive category', async () => {
      prismaMock.productCategory.updateMany.mockResolvedValue({
        count: 1,
      });

      prismaMock.productCategory.findUnique.mockResolvedValue({
        ...category,
        isActive: true,
      });

      const result = await service.activate(category.id);

      expect(result.isActive).toBe(true);

      expect(
        prismaMock.productCategory.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: category.id,
          isActive: false,
        },
        data: {
          isActive: true,
        },
      });
    });

    it('handles repeated activation', async () => {
      prismaMock.productCategory.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.productCategory.findUnique.mockResolvedValue({
        ...category,
        isActive: true,
      });

      const result = await service.activate(category.id);

      expect(result.isActive).toBe(true);

      expect(
        prismaMock.productCategory.updateMany,
      ).toHaveBeenCalledTimes(1);
    });

    it('returns 404 when activating a missing category', async () => {
      prismaMock.productCategory.updateMany.mockResolvedValue({
        count: 0,
      });

      prismaMock.productCategory.findUnique.mockResolvedValue(
        null,
      );

      await expect(
        service.activate('missing-category'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
