import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsInt()
  jobPositionId?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
