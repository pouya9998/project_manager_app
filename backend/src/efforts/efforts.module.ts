import { Module } from '@nestjs/common';
import { EffortsService } from './efforts.service';
import { EffortsController } from './efforts.controller';

@Module({
  controllers: [EffortsController],
  providers: [EffortsService],
})
export class EffortsModule {}
