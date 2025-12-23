import { Module } from '@nestjs/common';
import { AgentPerformanceService } from './agent-performance.service';
import { AgentPerformanceController } from './agent-performance.controller';
import { PrismaService } from '@/modules/prisma/prisma.service';
import { MissionControlModule } from '@/modules/mission-control/mission-control.module';
import { SearchModule } from '@/modules/search/search.module';
import { AgentPerformanceAnalyticsController } from './agent-performance-analytics.controller';
import { AgentPerformanceAnalyticsService } from './agent-performance-analytics.service';
import { AgentPerformanceCron } from './agent-performance.cron';

@Module({
  imports: [MissionControlModule, SearchModule],
  providers: [PrismaService, AgentPerformanceService, AgentPerformanceAnalyticsService, AgentPerformanceCron],
  controllers: [AgentPerformanceController, AgentPerformanceAnalyticsController],
  exports: [AgentPerformanceService],
})
export class AgentPerformanceModule {}
