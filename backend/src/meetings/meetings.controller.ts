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
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  MeetingRecurrence,
  MeetingStatus,
  MeetingType,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MeetingsService } from './meetings.service';

class CreateMeetingDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(MeetingRecurrence)
  recurrence?: MeetingRecurrence;

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  inviteeIds?: number[];

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsBoolean()
  startNow?: boolean;
}

class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  meetingUrl?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  inviteeIds?: number[];

  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @IsOptional()
  @IsEnum(MeetingRecurrence)
  recurrence?: MeetingRecurrence;

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string;

  @IsOptional()
  @IsInt()
  projectId?: number | null;
}

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get('calendar')
  calendar(
    @CurrentUser() user: { id: number },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.meetings.calendar(user.id, from, to);
  }

  @Post()
  create(@CurrentUser() user: { id: number }, @Body() body: CreateMeetingDto) {
    return this.meetings.create(user.id, body);
  }

  @Get(':id')
  getOne(@CurrentUser() user: { id: number }, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.getOne(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: number },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMeetingDto,
  ) {
    return this.meetings.update(id, user.id, body);
  }

  @Post(':id/start')
  start(@CurrentUser() user: { id: number }, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.start(id, user.id);
  }
}
