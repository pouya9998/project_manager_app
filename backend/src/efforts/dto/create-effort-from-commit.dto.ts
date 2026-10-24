import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateEffortFromCommitDto {
  @IsInt()
  commitId: number;

  @IsNumber()
  @Min(0.25)
  hours: number;

  @IsOptional()
  @IsString()
  description?: string;
}
