import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../auth/guards/session-auth.guard';
import { UserRole } from '../generated/prisma/enums';

import { ProductCategoriesService } from './product-categories.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { ListProductCategoriesDto } from './dto/list-product-categories.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

@Controller('product-categories')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ProductCategoriesController {
  constructor(
    private readonly categories:
      ProductCategoriesService,
  ) { }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateProductCategoryDto) {
    return this.categories.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  findAll(
    @Query() query: ListProductCategoriesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.categories.findAll(
      query,
      request.auth.user.role,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categories.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN)
  activate(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categories.activate(id);
  }

}
