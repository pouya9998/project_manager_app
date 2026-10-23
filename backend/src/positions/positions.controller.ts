import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';

@Controller('positions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PositionsController {
  constructor(private positions: PositionsService) {}

  @Get()
  findAll() {
    return this.positions.findAll();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreatePositionDto) {
    return this.positions.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CreatePositionDto) {
    return this.positions.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.positions.remove(id);
  }
}
