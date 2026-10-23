import { TaskStatus } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== '' ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  priority?: number;

  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'انتخاب پروژه الزامی است' })
  projectId: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(Number) : [];
      } catch {
        return value.split(',').filter(Boolean).map(Number);
      }
    }
    return value;
  })
  assigneeIds?: number[];
}
