import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CompleteTaskDto {
  /** GitLab MR iid within the linked SOFTWARE project */
  @IsInt()
  mrIid: number;

  @IsNumber()
  @Min(0.25)
  hours: number;

  @IsOptional()
  @IsString()
  description?: string;
}
