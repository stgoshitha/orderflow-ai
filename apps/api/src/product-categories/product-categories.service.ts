import {
  ConflictException,
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ListProductCategoriesDto } from './dto/list-product-categories.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

@Injectable()
export class ProductCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

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


  async findAll(
    query: ListProductCategoriesDto,
    role: UserRole,
  ) {
    const { page, limit } = query;
    const status = query.status ?? 'active';

    // Only ADMIN and STAFF are valid roles.
    if (
      role !== UserRole.ADMIN &&
      role !== UserRole.STAFF
    ) {
      throw new ForbiddenException('Access denied');
    }

    // Staff can only access active categories.
    if (
      role === UserRole.STAFF &&
      status !== 'active'
    ) {
      throw new ForbiddenException(
        'You cannot view inactive categories',
      );
    }

    const where: Prisma.ProductCategoryWhereInput =
      status === 'all'
        ? {}
        : { isActive: status === 'active' };

    const [data, total] = await this.prisma.$transaction([
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

  async update(
    id: string,
    dto: UpdateProductCategoryDto,
  ) {
    if (
      dto.name === undefined &&
      dto.description === undefined
    ) {
      throw new BadRequestException(
        'At least one field must be provided',
      );
    }

    const data: Prisma.ProductCategoryUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    try {
      return await this.prisma.productCategory.update({
        where: { id },
        data,
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
        Prisma.PrismaClientKnownRequestError
      ) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Product category already exists',
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


  async deactivate(id: string) {
    await this.prisma.productCategory.updateMany({
      where: {
        id,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    const category =
      await this.prisma.productCategory.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    if (!category) {
      throw new NotFoundException(
        'Product category not found',
      );
    }

    return category;
  }


  async activate(id: string) {
    await this.prisma.productCategory.updateMany({
      where: {
        id,
        isActive: false,
      },
      data: {
        isActive: true,
      },
    });

    const category =
      await this.prisma.productCategory.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

    if (!category) {
      throw new NotFoundException(
        'Product category not found',
      );
    }

    return category;
  }

}
