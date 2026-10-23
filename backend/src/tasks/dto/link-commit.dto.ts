import { IsDateString, IsOptional, IsString, IsUrl } from 'class-validator';

export class LinkCommitDto {
  @IsString()
  sha: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  webUrl?: string;

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsDateString()
  committedAt?: string;
}
