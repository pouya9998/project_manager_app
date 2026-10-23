import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateEffortDto {
  @IsNumber()
  taskId: number;

  @IsNumber()
  @Min(0.25)
  hours: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  workDate?: string;
}
