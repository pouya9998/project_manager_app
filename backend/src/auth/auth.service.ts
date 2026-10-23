import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { jobPosition: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    const token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const { password, ...safe } = user;
    return { accessToken: token, user: safe };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { jobPosition: true },
    });
    if (!user) throw new UnauthorizedException();
    const { password, ...safe } = user;
    return safe;
  }
}
