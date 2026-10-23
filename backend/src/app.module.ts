import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PositionsModule } from './positions/positions.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { EffortsModule } from './efforts/efforts.module';
import { GitlabModule } from './gitlab/gitlab.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    PositionsModule,
    ProjectsModule,
    TasksModule,
    EffortsModule,
    GitlabModule,
    DashboardModule,
    SettingsModule,
    ChatModule,
    NotificationsModule,
  ],
})
export class AppModule {}
