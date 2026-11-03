import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ListProductCategoriesDto } from './dto/list-product-categories.dto';

@Injectable()
export class ProductCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(dto: CreateProductCategoryDto) {
    try {
      return await this.prisma.productCategory.create({
        data: {
          name: dto.name,
          description: dto.description || null,
        },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Product category already exists',
        );
      }

      throw error;
    }
  }

  async findAll(query: ListProductCategoriesDto) {
    const { page, limit } = query;

    const where = {
      isActive: true,
    };

    const [data, total] =
      await this.prisma.$transaction([
        this.prisma.productCategory.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [
            { name: 'asc' },
            { id: 'asc' },
          ],
          skip: (page - 1) * limit,
          take: limit,
        }),

        this.prisma.productCategory.count({
          where,
        }),
      ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
