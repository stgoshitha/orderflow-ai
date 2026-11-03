
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { UserRole } from '../generated/prisma/enums';

import { ProductCategoriesService } from './product-categories.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ListProductCategoriesDto } from './dto/list-product-categories.dto';

@Controller('product-categories')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ProductCategoriesController {
  constructor(
    private readonly categories:
      ProductCategoriesService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateProductCategoryDto) {
    return this.categories.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  findAll(@Query() query: ListProductCategoriesDto) {
    return this.categories.findAll(query);
  }
}
