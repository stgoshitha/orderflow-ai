import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsIn,
  Max,
  Min,
} from 'class-validator';

export class ListProductCategoriesDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status: 'active' | 'inactive' | 'all' = 'active';
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}
