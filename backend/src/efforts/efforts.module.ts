import { Module } from '@nestjs/common';
import { GitlabModule } from '../gitlab/gitlab.module';
import { EffortsService } from './efforts.service';
import { EffortsController } from './efforts.controller';
import { EffortJudgeService } from './effort-judge.service';

@Module({
  imports: [GitlabModule],
  controllers: [EffortsController],
  providers: [EffortsService, EffortJudgeService],
  exports: [EffortsService, EffortJudgeService],
})
export class EffortsModule {}
