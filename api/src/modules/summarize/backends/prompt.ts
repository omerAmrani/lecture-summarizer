export const TRUNCATION_WARNING = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';

export const SYSTEM_PROMPT = 'Always respond in Hebrew, regardless of the transcript content or length. Technical terms may remain in English.';

export const DEFAULT_SUMMARY_PROMPT = `Summarize the following lecture in chronological order, section by section as it was taught.
Each section becomes a standalone study passage, matched to one course topic and later used to answer exam questions, so completeness matters more than brevity.

Every section starts with its own header line:
**[mm:ss] Subject title**
- Sub-topic: the explanation as the lecturer gave it: definitions, distinctions, mechanisms, why it matters. Bold each concept the first time it appears, e.g. **רקורסיה**, with the English term if the lecturer gave one.
- Example / experiment (if given): who, what was done, what was found, what it shows.

Rules:
- One topic per section. When the lecturer moves to a different concept, start a new header at the time it began.
- Each section must stand alone: no "as mentioned above"; restate the needed term.
- Keep every detail an exam could ask about: definitions, researchers and theories, study designs and results, numbers, lists and stages, comparisons.
- Use only what was said in the lecture; add nothing from outside it. If a term looks mis-transcribed, write the likely term followed by (?).
- Skip only filler, repetition and off-topic chatter.
- Admin announcements, exam-scope remarks and emphasis ("this will be on the exam", "skip this") get their own section with its own [mm:ss] header at the time they were said, never inside a content section.
- No text before the first header or after the last section.`;

export const MAX_SUMMARY_PROMPT_LENGTH = 10_000;

// The transcript is always appended here, so an edited prompt can't drop it.
export function buildPrompt(transcript: string, prompt: string): string {
  return `${prompt}\n\nTranscript:\n${transcript}`;
}

// Shared by Settings (Custom prompt) and re-summarize (One-off prompt).
export function validateSummaryPrompt(value: unknown): { prompt: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: 'prompt must be a non-empty string' };
  const prompt = value.trim();
  if (prompt.length > MAX_SUMMARY_PROMPT_LENGTH) return { error: `prompt must be at most ${MAX_SUMMARY_PROMPT_LENGTH} characters` };
  return { prompt };
}
