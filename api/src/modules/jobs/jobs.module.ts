import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { SettingsController } from './settings.controller';
import { StorageModule } from '../storage/storage.module';
import { SummarizeModule } from '../summarize/summarize.module';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [StorageModule, SummarizeModule, AuthModule, EmailModule],
  controllers: [JobsController, SettingsController],
})
export class JobsModule {}
