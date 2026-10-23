import { TaskStatus } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsInt()
  projectId?: number | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  assigneeIds?: number[];

  @IsOptional()
  @IsInt()
  stepId?: number | null;
}
