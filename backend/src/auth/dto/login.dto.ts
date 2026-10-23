import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  email: string;

  @IsString()
  @MinLength(4, { message: 'رمز عبور کوتاه است' })
  password: string;
}
