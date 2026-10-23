import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GitlabService } from './gitlab.service';
import { UpsertGitlabConfigDto } from './dto/upsert-config.dto';

@Controller('gitlab')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GitlabController {
  constructor(private gitlab: GitlabService) {}

  @Get('config')
  @Roles(Role.ADMIN)
  getConfig() {
    return this.gitlab.getConfig();
  }

  @Put('config')
  @Roles(Role.ADMIN)
  upsertConfig(@Body() dto: UpsertGitlabConfigDto) {
    return this.gitlab.upsertConfig(dto);
  }

  @Post('test')
  @Roles(Role.ADMIN)
  test() {
    return this.gitlab.testConnection();
  }

  @Get('projects')
  listProjects(@Query('search') search?: string) {
    return this.gitlab.listProjects(search);
  }

  @Get('projects/:id/commits')
  listCommits(
    @Param('id', ParseIntPipe) id: number,
    @Query('search') search?: string,
  ) {
    return this.gitlab.listCommits(id, search);
  }

  @Get('projects/:id/merge-requests')
  listMrs(
    @Param('id', ParseIntPipe) id: number,
    @Query('state') state?: string,
  ) {
    return this.gitlab.listMergeRequests(id, state || 'all');
  }
}
