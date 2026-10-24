import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateStepDto, ReorderStepsDto, UpdateStepDto } from './dto/create-step.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projects.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Post(':id/gitlab/sync')
  @Roles(Role.ADMIN)
  syncGitlab(@Param('id', ParseIntPipe) id: number) {
    return this.projects.syncGitlab(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projects.remove(id);
  }

  @Get(':id/steps')
  listSteps(@Param('id', ParseIntPipe) id: number) {
    return this.projects.listSteps(id);
  }

  @Post(':id/steps')
  @Roles(Role.ADMIN)
  createStep(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateStepDto) {
    return this.projects.createStep(id, dto);
  }

  @Patch(':id/steps/:stepId')
  @Roles(Role.ADMIN)
  updateStep(
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateStepDto,
  ) {
    return this.projects.updateStep(id, stepId, dto);
  }

  @Delete(':id/steps/:stepId')
  @Roles(Role.ADMIN)
  removeStep(
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
  ) {
    return this.projects.removeStep(id, stepId);
  }

  @Put(':id/steps/reorder')
  @Roles(Role.ADMIN)
  reorderSteps(@Param('id', ParseIntPipe) id: number, @Body() dto: ReorderStepsDto) {
    return this.projects.reorderSteps(id, dto.ids);
  }
}
