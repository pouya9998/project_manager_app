import { Module } from '@nestjs/common';
import { GitlabService } from './gitlab.service';
import { GitlabController } from './gitlab.controller';
import { GitlabWebhookController } from './gitlab-webhook.controller';
import { GitlabSyncService } from './gitlab-sync.service';

@Module({
  controllers: [GitlabController, GitlabWebhookController],
  providers: [GitlabService, GitlabSyncService],
  exports: [GitlabService, GitlabSyncService],
})
export class GitlabModule {}
