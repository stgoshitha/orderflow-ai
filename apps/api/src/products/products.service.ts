import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateProductDto) {
    // Verify that the category exists and is active.
    const category =
      await this.prisma.productCategory.findUnique({
        where: { id: dto.categoryId },
        select: { isActive: true },
      });

    if (!category) {
      throw new NotFoundException(
        'Product category not found',
      );
    }

    if (!category.isActive) {
      throw new BadRequestException(
        'Cannot assign a product to an inactive category',
      );
    }

    try {
      // Nested writes are atomic.
      return await this.prisma.product.create({
        data: {
          sku: dto.sku,
          name: dto.name,
          description: dto.description ?? null,
          sellingPrice: new Prisma.Decimal(
            dto.sellingPrice,
          ),

          category: {
            connect: {
              id: dto.categoryId,
            },
          },

          inventoryBalance: {
            create: {
              quantityOnHand: 0,
              quantityReserved: 0,
            },
          },
        },

        select: {
          id: true,
          sku: true,
          name: true,
          description: true,
          sellingPrice: true,
          categoryId: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,

          inventoryBalance: {
            select: {
              quantityOnHand: true,
              quantityReserved: true,
            },
          },
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof
        Prisma.PrismaClientKnownRequestError
      ) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Product SKU already exists',
          );
        }

        if (error.code === 'P2025') {
          throw new NotFoundException(
            'Product category not found',
          );
        }
      }

      throw error;
    }
  }
}
