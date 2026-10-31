import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildPrompt, TRUNCATION_WARNING, SYSTEM_PROMPT } from './prompt';
import { MERGE_MAX_TOKENS } from '../../../config';
import type { ModelOption } from '../summarize.service';

function getModel(apiKey: string, model: string) {
  if (!apiKey) throw new Error('Gemini API key required for summarization');
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model, systemInstruction: SYSTEM_PROMPT });
}

export async function mergeSummaries(chunks: string[], apiKey: string, modelId: string, onProgress = (_: string) => {}, onToken: ((t: string) => void) | null = null): Promise<string> {
  const fullTranscript = chunks.join('\n\n');
  onProgress('מסכם עם Gemini...');

  const model = getModel(apiKey, modelId);

  if (onToken) {
    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(fullTranscript) }] }],
      generationConfig: { maxOutputTokens: MERGE_MAX_TOKENS },
    });
    let full = '';
    for await (const chunk of result.stream) {
      const token = chunk.text();
      full += token;
      onToken(token);
    }
    const response = await result.response;
    if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      const warning = TRUNCATION_WARNING;
      console.warn('[summarize] Gemini output truncated by token limit.');
      onToken(warning);
      full += warning;
    }
    return full;
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: buildPrompt(fullTranscript) }] }],
    generationConfig: { maxOutputTokens: MERGE_MAX_TOKENS },
  });
  const response = result.response;
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    const warning = TRUNCATION_WARNING;
    console.warn('[summarize] Gemini output truncated by token limit.');
    return response.text() + warning;
  }
  return response.text();
}

// @google/generative-ai has no list call, so this uses the REST endpoint directly.
const NOT_TEXT = /embedding|imagen|image|tts|audio|live|aqa|veo/;

export async function listModels(apiKey: string): Promise<ModelOption[]> {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!r.ok) throw new Error(`Gemini models list failed: ${r.status}`);
  const data: { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] } = await r.json();
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }))
    .filter((m) => !NOT_TEXT.test(m.id));
}
