import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { EmbeddingsService } from '@/modules/ai/embeddings.service';

import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SemanticSearchController } from './semantic.controller';
import { SemanticSearchService } from './semantic.service';
import { IngestService } from './ingest.service';
import { INDEXER_QUEUE, IndexerProcessor, IndexerProducer } from './indexer.queue';
import { IndexController } from './index.controller';
import { GlobalSearchService } from './global-search.service';
import { GlobalSearchController } from './global-search.controller';
import { SearchVectorService } from './search-vector.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: INDEXER_QUEUE
    }),
    PermissionsModule
  ],
  controllers: [SearchController, SemanticSearchController, IndexController, GlobalSearchController],
  providers: [
    SearchService,
    SemanticSearchService,
    EmbeddingsService,
    IngestService,
    IndexerProducer,
    IndexerProcessor,
    GlobalSearchService,
    SearchVectorService
  ],
  exports: [SemanticSearchService, IngestService, IndexerProducer, SearchVectorService, GlobalSearchService, EmbeddingsService]
})
export class SearchModule {}
