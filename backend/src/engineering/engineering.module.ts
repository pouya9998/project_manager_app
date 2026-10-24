import { Module } from '@nestjs/common';
import { GitlabModule } from '../gitlab/gitlab.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EngineeringController } from './engineering.controller';
import { EngineeringService } from './engineering.service';

@Module({
  imports: [GitlabModule, NotificationsModule],
  controllers: [EngineeringController],
  providers: [EngineeringService],
  exports: [EngineeringService],
})
export class EngineeringModule {}
