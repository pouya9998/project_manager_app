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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role, TaskStatus } from '@prisma/client';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { LinkCommitDto } from './dto/link-commit.dto';
import { LinkMrDto } from './dto/link-mr.dto';
import { AddCommentDto } from './dto/add-comment.dto';

const uploadDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get()
  findAll(
    @CurrentUser() user: { id: number; role: Role },
    @Query('status') status?: TaskStatus,
    @Query('projectId') projectId?: string,
    @Query('q') q?: string,
  ) {
    return this.tasks.findAll(
      user,
      status,
      projectId ? Number(projectId) : undefined,
      q,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.findOne(id, user);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: { id: number },
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (typeof (dto as any).assigneeIds === 'string') {
      try {
        dto.assigneeIds = JSON.parse((dto as any).assigneeIds);
      } catch {
        dto.assigneeIds = String((dto as any).assigneeIds)
          .split(',')
          .filter(Boolean)
          .map(Number);
      }
    }
    if (dto.projectId) dto.projectId = Number(dto.projectId);
    if (dto.priority) dto.priority = Number(dto.priority);
    return this.tasks.create(dto, user.id, files || []);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.update(id, dto, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: TaskStatus,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.updateStatus(id, status, user);
  }

  @Patch(':id/step')
  updateStep(
    @Param('id', ParseIntPipe) id: number,
    @Body('stepId') stepId: number | null,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.updateStep(id, stepId === null || stepId === undefined ? null : Number(stepId), user);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  addAttachments(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.addAttachments(id, files || [], user);
  }

  @Post(':id/commits')
  linkCommit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkCommitDto,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.linkCommit(id, dto, user);
  }

  @Post(':id/merge-requests')
  linkMr(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkMrDto,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.linkMr(id, dto, user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.tasks.addComment(id, dto.content, user, dto.mentionIds || []);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tasks.remove(id);
  }
}
