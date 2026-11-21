import { apiFetch } from './api';

// "Send to study system" (see GLOSSARY.md): what study-system did with the summary.
export interface StudyResult { sentAt: string; passages: number; duplicates: number; notes: number; suggestions: number; sections?: string[] }

export async function sendToStudySystem(classId: string, lectureId: string, summaryId?: string | null): Promise<StudyResult> {
  const r = await apiFetch(`/api/classes/${classId}/lectures/${lectureId}/study`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaryId: summaryId ?? null }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'שגיאה');
  return data;
}

export const studyResultText = (r: StudyResult) =>
  `נשלח: ${r.passages} פסקאות, ${r.notes} הערות, ${r.suggestions} הצעות` + (r.duplicates ? ` (${r.duplicates} כפולות דולגו)` : '');
