export const TRUNCATION_WARNING = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';

export const SYSTEM_PROMPT = 'Always respond in Hebrew, regardless of the transcript content or length. Technical terms may remain in English.';

export const DEFAULT_SUMMARY_PROMPT = `Summarize the following lecture in chronological order, section by section as it was taught.
Your summary should be 2–3 pages long (roughly 1000–1500 words).

For each section use this format:
**[timestamp] Subject title**
- Sub-topic: 2–4 sentences covering the key idea. Bold any concept or term name the first time it appears, e.g. **רקורסיה**
- Example (if given): brief description of what it illustrates

Skip filler, repetition, and admin announcements.`;

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
