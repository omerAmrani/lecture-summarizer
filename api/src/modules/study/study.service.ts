import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { getStudyConfig, ENV_KEYS } from '../../credentials';

// 400 = the user can fix it here (no URL/token, no course number, no date, no summary); 502 = study-system refused or failed.
export class StudyError extends Error {
  constructor(message: string, readonly status: 400 | 502) { super(message); }
}

// The study-system Lecture summary ingest (study-system #166) calls a model before it answers.
const TIMEOUT_MS = 180_000;

export interface StudyResult { passages: number; duplicates: number; notes: number; suggestions: number; sections?: string[] }

// Open University course number from the class code, e.g. "10615" or "קורס 10615".
export function courseNumber(code: string | null | undefined): string | null {
  return String(code ?? '').match(/\d{5}/)?.[0] ?? null;
}

// "Send to study system": see GLOSSARY.md. Omer checks the summary first; sending again replaces that lecture there.
@Injectable()
export class StudyService {
  constructor(private readonly storage: StorageService) {}

  // Sends one summary version (default: the current one) and records studySentAt. Throws StudyError.
  async send(classId: string, lectureId: string, summaryId?: string | null): Promise<StudyResult & { sentAt: string }> {
    const cfg = getStudyConfig();
    if (!cfg) throw new StudyError(`${ENV_KEYS.study} missing — set them in .env`, 400);
    const lecture = this.storage.getLecture(classId, lectureId);
    const cls = this.storage.getClass(classId);
    if (!lecture || !cls) throw new StudyError('Lecture not found', 400);
    const course = courseNumber(cls.code);
    if (!course) throw new StudyError('לקורס אין מספר קורס (5 ספרות) — הוסף אותו בעריכת הקורס', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lecture.lectureDate || '')) throw new StudyError('להרצאה אין תאריך — הוסף אותו בעריכת ההרצאה', 400);
    const summary = summaryId
      ? this.storage.getSummaryContent(classId, lectureId, summaryId)
      : this.storage.getCurrentSummaryContent(classId, lectureId);
    if (!summary) throw new StudyError('No summary to send', 400);

    let body: any;
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ course, lecture_date: lecture.lectureDate, summary }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) throw new Error(body?.error || `study-system answered ${res.status}`);
    } catch (err: any) {
      const message = err?.name === 'TimeoutError' ? 'study-system did not answer in time' : err?.message || 'send failed';
      this.storage.updateLectureMeta(classId, lectureId, { lastStudyError: message });
      throw new StudyError(message, 502);
    }
    const sentAt = new Date().toISOString();
    this.storage.updateLectureMeta(classId, lectureId, { studySentAt: sentAt, lastStudyError: null });
    const { passages = 0, duplicates = 0, notes = 0, suggestions = 0, sections } = body;
    return { sentAt, passages, duplicates, notes, suggestions, sections };
  }
}
