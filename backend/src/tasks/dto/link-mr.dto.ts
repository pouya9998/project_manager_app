import { IsInt, IsOptional, IsString } from 'class-validator';

export class LinkMrDto {
  @IsInt()
  mrIid: number;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  webUrl?: string;

  @IsOptional()
  @IsString()
  sourceBranch?: string;

  @IsOptional()
  @IsString()
  targetBranch?: string;
}
