import { Module } from '@nestjs/common';
import { StudyService } from './study.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [StudyService],
  exports: [StudyService],
})
export class StudyModule {}
