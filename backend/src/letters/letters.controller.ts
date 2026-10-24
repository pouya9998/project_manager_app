import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LettersService } from './letters.service';

class CreateLetterDto {
  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  recipientIds?: number[];

  @IsOptional()
  @IsBoolean()
  send?: boolean;
}

class UpdateLetterDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  recipientIds?: number[];
}

class TemplateDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

class SendFromTemplateDto {
  @IsInt()
  templateId: number;

  @IsArray()
  @IsInt({ each: true })
  recipientIds: number[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

@Controller('letters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LettersController {
  constructor(private letters: LettersService) {}

  @Get('unread-count')
  unread(@CurrentUser() user: { id: number }) {
    return this.letters.unreadCount(user.id).then((count) => ({ count }));
  }

  @Get()
  list(
    @CurrentUser() user: { id: number },
    @Query('box') box?: string,
  ) {
    if (box === 'sent') return this.letters.listSent(user.id);
    if (box === 'drafts') return this.letters.listDrafts(user.id);
    return this.letters.listInbox(user.id);
  }

  @Get('templates')
  templates(@CurrentUser() user: { id: number }) {
    return this.letters.listTemplates(user.id);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: { id: number }, @Body() dto: TemplateDto) {
    return this.letters.createTemplate(user.id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.letters.deleteTemplate(id, user.id, user.role);
  }

  @Get('templates/:id/preview')
  preview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Query('recipientId') recipientId?: string,
  ) {
    return this.letters.previewFromTemplate(
      id,
      user.id,
      recipientId ? Number(recipientId) : undefined,
    );
  }

  @Post('from-template')
  fromTemplate(@CurrentUser() user: { id: number }, @Body() dto: SendFromTemplateDto) {
    return this.letters.sendFromTemplate(user.id, dto);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.letters.getOne(id, user.id);
  }

  @Post()
  create(@CurrentUser() user: { id: number }, @Body() dto: CreateLetterDto) {
    return this.letters.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number },
    @Body() dto: UpdateLetterDto,
  ) {
    return this.letters.update(id, user.id, dto);
  }

  @Post(':id/send')
  send(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.letters.send(id, user.id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.letters.remove(id, user.id, user.role);
  }
}
