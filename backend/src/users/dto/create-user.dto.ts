import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(4)
  password: string;

  @IsString()
  fullName: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsInt()
  jobPositionId?: number;
}
