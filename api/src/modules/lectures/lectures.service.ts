import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface ActiveJob {
  bus?: EventEmitter;
  controllers: Map<string, AbortController>;
  // Latest progress event, in memory only, so polling clients (other tabs, after a refresh) can show it.
  progress?: { message?: string; pct?: number };
}

@Injectable()
export class LecturesService {
  readonly activeJobs = new Map<string, ActiveJob>();

  withProgress<T extends { id: string }>(classId: string, lecture: T): T & { progress?: ActiveJob['progress'] } {
    const progress = this.activeJobs.get(`${classId}/${lecture.id}`)?.progress;
    return progress ? { ...lecture, progress } : lecture;
  }
}
