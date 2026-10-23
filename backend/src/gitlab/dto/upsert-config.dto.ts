import { IsOptional, IsString, MinLength, Matches } from 'class-validator';

export class UpsertGitlabConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @Matches(/^https?:\/\/.+/i, { message: 'آدرس گیت‌لب معتبر نیست' })
  baseUrl: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  accessToken?: string;
}
