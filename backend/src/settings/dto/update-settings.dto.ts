import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'نام برنامه خیلی کوتاه است' })
  appName?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{6})$/, { message: 'رنگ باید به صورت هگز ۶ رقمی باشد مثل #0f6e56' })
  primaryColor?: string;
}
