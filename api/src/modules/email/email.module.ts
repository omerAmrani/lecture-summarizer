import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
