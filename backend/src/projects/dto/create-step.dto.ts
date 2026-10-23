import { IsArray, IsInt, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateStepDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6})$/)
  color?: string;
}

export class UpdateStepDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6})$/)
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ReorderStepsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}
