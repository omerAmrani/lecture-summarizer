import OpenAI from 'openai';
import { buildPrompt, TRUNCATION_WARNING, SYSTEM_PROMPT } from './prompt';
import { MERGE_MAX_TOKENS } from '../../../config';
import type { ModelOption } from '../summarize.service';

function getClient(apiKey: string): OpenAI {
  if (!apiKey) throw new Error('OpenAI API key required for summarization');
  return new OpenAI({ apiKey });
}

function messages(transcript: string): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt(transcript) },
  ];
}

export async function mergeSummaries(chunks: string[], apiKey: string, model: string, onProgress = (_: string) => {}, onToken: ((t: string) => void) | null = null): Promise<string> {
  const fullTranscript = chunks.join('\n\n');
  onProgress('מסכם עם OpenAI...');

  const client = getClient(apiKey);

  if (onToken) {
    const stream = await client.chat.completions.create({
      model,
      max_completion_tokens: MERGE_MAX_TOKENS,
      messages: messages(fullTranscript),
      stream: true,
    });
    let full = '';
    let truncated = false;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const token = choice?.delta?.content;
      if (token) {
        full += token;
        onToken(token);
      }
      if (choice?.finish_reason === 'length') truncated = true;
    }
    if (truncated) {
      onToken(TRUNCATION_WARNING);
      full += TRUNCATION_WARNING;
    }
    return full;
  }

  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: MERGE_MAX_TOKENS,
    messages: messages(fullTranscript),
  });
  const choice = response.choices[0];
  const text = choice?.message?.content ?? '';
  return choice?.finish_reason === 'length' ? text + TRUNCATION_WARNING : text;
}

// models.list() returns every model (embeddings, audio, images…) with only an id — keep chat models by name.
const CHAT = /^(gpt-|o\d|chatgpt-)/;
const NOT_CHAT = /audio|realtime|tts|transcribe|image|search|embedding|instruct|codex|moderation|-\d{4}-\d{2}-\d{2}$/;

export async function listModels(apiKey: string): Promise<ModelOption[]> {
  const models: ModelOption[] = [];
  for await (const m of getClient(apiKey).models.list()) {
    if (CHAT.test(m.id) && !NOT_CHAT.test(m.id)) models.push({ id: m.id, name: m.id });
  }
  return models.sort((a, b) => b.id.localeCompare(a.id));
}
