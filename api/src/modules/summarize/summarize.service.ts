import { Injectable } from '@nestjs/common';
import type { SummarizeBackendName } from '../../credentials';

export type ProgressCallback = (msg: string) => void;
export type TokenCallback = (token: string) => void;

export interface ModelOption {
  id: string;
  name: string;
  recommended?: boolean;
}

export interface SummarizerBackend {
  mergeSummaries(chunks: string[], apiKey: string, model: string, onProgress?: ProgressCallback, onToken?: TokenCallback | null): Promise<string>;
  listModels(apiKey: string): Promise<ModelOption[]>;
}

const backends: Record<SummarizeBackendName, () => Promise<SummarizerBackend>> = {
  gemini: () => import('./backends/summarize-gemini'),
  claude: () => import('./backends/summarize-claude'),
  openai: () => import('./backends/summarize-openai'),
};

// Recommended = each provider's cheap tier that still takes a whole lecture transcript in one go.
// ponytail: name-based heuristic (no provider API exposes price); revisit if a provider renames its tiers.
const RECOMMENDED: Record<SummarizeBackendName, RegExp> = {
  gemini: /flash/,
  claude: /haiku/,
  openai: /mini/,
};

@Injectable()
export class SummarizeService {
  async getSummarizer(backend: SummarizeBackendName): Promise<SummarizerBackend> {
    return backends[backend]();
  }

  // Live list from the provider, recommended models first (stable sort keeps the provider's order otherwise).
  async listModels(backend: SummarizeBackendName, apiKey: string): Promise<ModelOption[]> {
    const models = await (await this.getSummarizer(backend)).listModels(apiKey);
    return models
      .map((m) => ({ ...m, recommended: RECOMMENDED[backend].test(m.id) }))
      .sort((a, b) => Number(b.recommended) - Number(a.recommended));
  }

  withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        if (signal.aborted) return reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
      }),
    ]);
  }
}
