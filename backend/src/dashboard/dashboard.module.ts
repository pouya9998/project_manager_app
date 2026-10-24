import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { EngineeringModule } from '../engineering/engineering.module';

@Module({
  imports: [EngineeringModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
