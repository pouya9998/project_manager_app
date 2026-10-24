import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const uploadDir = join(process.cwd(), 'uploads', 'branding');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `logo-${Date.now()}${extname(file.originalname).toLowerCase()}`;
          cb(null, unique);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(png|jpe?g|webp|svg\+xml|gif)$/i.test(file.mimetype);
        if (!ok) {
          return cb(new Error('فقط فایل تصویری مجاز است') as any, false);
        }
        cb(null, true);
      },
      limits: { fileSize: 3 * 1024 * 1024 },
    }),
  )
  uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return this.settings.setLogo(file);
  }

  @Post('favicon')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('favicon', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `favicon-${Date.now()}${extname(file.originalname).toLowerCase()}`;
          cb(null, unique);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ok =
          /^image\/(png|jpe?g|webp|svg\+xml|gif|x-icon|vnd\.microsoft\.icon)$/i.test(
            file.mimetype,
          ) || /\.(ico|png|svg|webp|jpe?g)$/i.test(file.originalname);
        if (!ok) {
          return cb(new Error('فقط تصویر فاویکون مجاز است') as any, false);
        }
        cb(null, true);
      },
      limits: { fileSize: 1 * 1024 * 1024 },
    }),
  )
  uploadFavicon(@UploadedFile() file: Express.Multer.File) {
    return this.settings.setFavicon(file);
  }

  @Delete('favicon')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  clearFavicon() {
    return this.settings.clearFavicon();
  }
}
