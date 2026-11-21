import { Module } from '@nestjs/common';
import { LecturesController } from './lectures.controller';
import { LecturesService } from './lectures.service';
import { TranscribeProcessor } from './transcribe.processor';
import { StorageModule } from '../storage/storage.module';
import { DownloadModule } from '../download/download.module';
import { SummarizeModule } from '../summarize/summarize.module';
import { StudyModule } from '../study/study.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    StorageModule,
    DownloadModule,
    SummarizeModule,
    AuthModule,
    StudyModule,
  ],
  controllers: [LecturesController],
  providers: [LecturesService, TranscribeProcessor],
})
export class LecturesModule {}
