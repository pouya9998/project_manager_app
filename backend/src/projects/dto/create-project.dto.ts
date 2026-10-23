import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  gitlabProjectId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
