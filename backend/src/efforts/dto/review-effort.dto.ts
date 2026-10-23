import { EffortStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ReviewEffortDto {
  @IsEnum(EffortStatus)
  status: EffortStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedHours?: number;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}
