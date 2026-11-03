import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProductCategoryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) =>
    value !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) =>
    value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
