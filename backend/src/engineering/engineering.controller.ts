import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, TaskDependencyType } from '@prisma/client';
import { IsEnum, IsInt } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { EngineeringService } from './engineering.service';

class CreateDepDto {
  @IsInt()
  fromTaskId: number;

  @IsInt()
  toTaskId: number;

  @IsEnum(TaskDependencyType)
  type: TaskDependencyType = TaskDependencyType.BLOCKS;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EngineeringController {
  constructor(private engineering: EngineeringService) {}

  @Get('tasks/:id/engineering-timeline')
  timeline(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: Role },
  ) {
    return this.engineering.timeline(id, user);
  }

  @Get('tasks/:id/dependencies')
  listDeps(@Param('id', ParseIntPipe) id: number) {
    return this.engineering.listDependencies(id);
  }

  @Post('tasks/dependencies')
  @Roles(Role.ADMIN)
  addDep(@Body() dto: CreateDepDto, @CurrentUser() user: { id: number; role: Role }) {
    return this.engineering.addDependency(dto.fromTaskId, dto.toTaskId, dto.type, user);
  }

  @Delete('tasks/dependencies/:id')
  @Roles(Role.ADMIN)
  removeDep(@Param('id', ParseIntPipe) id: number) {
    return this.engineering.removeDependency(id);
  }

  @Get('engineering/dashboard')
  @Roles(Role.ADMIN)
  dashboard(
    @Query('projectId') projectId?: string,
    @Query('days') days?: string,
  ) {
    return this.engineering.softwareDashboard({
      projectId: projectId ? Number(projectId) : undefined,
      days: days ? Number(days) : 30,
    });
  }
}
