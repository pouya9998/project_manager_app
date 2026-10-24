import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EffortStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EffortsService } from './efforts.service';
import { CreateEffortDto } from './dto/create-effort.dto';
import { CreateEffortFromCommitDto } from './dto/create-effort-from-commit.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { ReviewEffortDto } from './dto/review-effort.dto';

@Controller('efforts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EffortsController {
  constructor(private efforts: EffortsService) {}

  @Get()
  findAll(
    @CurrentUser() user: { id: number; role: Role },
    @Query('status') status?: EffortStatus,
  ) {
    return this.efforts.findAll(user, status);
  }

  @Get('completion-options')
  completionOptions(
    @Query('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.efforts.completionOptions(taskId, user);
  }

  @Get('claimable-commits')
  claimableCommits(
    @Query('taskId', ParseIntPipe) taskId: number,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.efforts.claimableCommits(taskId, user.id, user.role);
  }

  @Post()
  create(@Body() dto: CreateEffortDto, @CurrentUser() user: { id: number }) {
    return this.efforts.create(dto, user.id);
  }

  @Post('from-commit')
  createFromCommit(
    @Body() dto: CreateEffortFromCommitDto,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.efforts.createFromCommit(dto, user.id, user.role);
  }

  @Post('complete-task/:taskId')
  completeTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: CompleteTaskDto,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.efforts.completeWithMergeRequest(taskId, dto, user);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN)
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewEffortDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.efforts.review(id, dto, user.id);
  }
}
