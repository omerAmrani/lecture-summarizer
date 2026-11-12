import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as config from '../src/config';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { SummarizeService } from '../src/modules/summarize/summarize.service';
import { getSummarizeBackend } from '../src/credentials';
import { buildPrompt, DEFAULT_SUMMARY_PROMPT } from '../src/modules/summarize/backends/prompt';
import { truncateAll } from './helpers/db';
import { authCookie } from './helpers/auth';

describe('Summarize settings + models', () => {
  let app: INestApplication;
  let summarize: SummarizeService;
  const cookie = authCookie('user-a');
  const get = (url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie);
  const put = (url: string) => request(app.getHttpServer()).put(url).set('Cookie', cookie);
  const del = (url: string) => request(app.getHttpServer()).delete(url).set('Cookie', cookie);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [JobsModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    summarize = module.get(SummarizeService);
  });

  afterAll(() => app.close());
  beforeEach(() => truncateAll());

  describe('GET/PUT /api/settings/summarize', () => {
    it('requires a session', async () => {
      expect((await request(app.getHttpServer()).get('/api/settings/summarize')).status).toBe(401);
    });

    it('starts empty, then saves and returns the default', async () => {
      expect((await get('/api/settings/summarize')).body).toEqual({ default: null });

      const saved = await put('/api/settings/summarize')
        .send({ backend: 'openai', model: 'gpt-x-mini' });
      expect(saved.status).toBe(200);

      const got = await get('/api/settings/summarize');
      expect(got.body).toEqual({ default: { backend: 'openai', model: 'gpt-x-mini' } });
    });

    it('rejects an unknown backend or a blank model', async () => {
      const bad = await put('/api/settings/summarize').send({ backend: 'llama' });
      expect(bad.status).toBe(400);
      const blank = await put('/api/settings/summarize').send({ backend: 'claude', model: ' ' });
      expect(blank.status).toBe(400);
    });
  });

  describe('GET/PUT/DELETE /api/settings/summarize-prompt', () => {
    const url = '/api/settings/summarize-prompt';

    it('requires a session', async () => {
      expect((await request(app.getHttpServer()).get(url)).status).toBe(401);
    });

    it('starts on the Default prompt', async () => {
      expect((await get(url)).body).toEqual({ prompt: DEFAULT_SUMMARY_PROMPT, default: DEFAULT_SUMMARY_PROMPT, isCustom: false });
    });

    it('saves a trimmed Custom prompt, then resets it', async () => {
      const saved = await put(url).send({ prompt: '  Be brief  ' });
      expect(saved.body).toMatchObject({ prompt: 'Be brief', isCustom: true });
      expect((await get(url)).body).toMatchObject({ prompt: 'Be brief', isCustom: true });

      const reset = await del(url);
      expect(reset.body).toMatchObject({ prompt: DEFAULT_SUMMARY_PROMPT, isCustom: false });
    });

    it('saving the Default prompt text is not custom', async () => {
      expect((await put(url).send({ prompt: DEFAULT_SUMMARY_PROMPT })).body.isCustom).toBe(false);
    });

    it('rejects empty, missing or too-long prompts', async () => {
      expect((await put(url).send({ prompt: '   ' })).status).toBe(400);
      expect((await put(url).send({})).status).toBe(400);
      expect((await put(url).send({ prompt: 'x'.repeat(10_001) })).status).toBe(400);
    });
  });

  describe('buildPrompt', () => {
    it('is byte-for-byte the pre-feature request with the Default prompt', () => {
      expect(buildPrompt('T', DEFAULT_SUMMARY_PROMPT)).toBe(`${DEFAULT_SUMMARY_PROMPT}\n\nTranscript:\nT`);
      expect(buildPrompt('T', DEFAULT_SUMMARY_PROMPT).endsWith('Skip filler, repetition, and admin announcements.\n\nTranscript:\nT')).toBe(true);
    });

    it('always appends the transcript after a custom prompt', () => {
      expect(buildPrompt('the transcript', 'Be brief')).toBe('Be brief\n\nTranscript:\nthe transcript');
    });
  });

  describe('GET /api/models/:backend', () => {
    it('lists models with recommended ones first', async () => {
      jest.spyOn(summarize, 'getSummarizer').mockResolvedValueOnce({
        mergeSummaries: jest.fn(),
        listModels: jest.fn().mockResolvedValue([
          { id: 'gemini-pro', name: 'Pro' },
          { id: 'gemini-flash', name: 'Flash' },
        ]),
      });
      const res = await get('/api/models/gemini');
      expect(res.status).toBe(200);
      expect(res.body.models).toEqual([
        { id: 'gemini-flash', name: 'Flash', recommended: true },
        { id: 'gemini-pro', name: 'Pro', recommended: false },
      ]);
    });

    it('returns 400 when the provider has no key', async () => {
      const res = await get('/api/models/openai');
      expect(res.status).toBe(400);
    });

    it('returns 502 when the provider call fails', async () => {
      jest.spyOn(summarize, 'getSummarizer').mockResolvedValueOnce({
        mergeSummaries: jest.fn(),
        listModels: jest.fn().mockRejectedValue(new Error('boom')),
      });
      const res = await get('/api/models/claude');
      expect(res.status).toBe(502);
      expect(res.body.error).toBe('boom');
    });
  });

  describe('getSummarizeBackend', () => {
    it('never swaps an explicitly requested provider that has no key', () => {
      const r = getSummarizeBackend({ backend: 'openai' });
      expect(r).toEqual({ error: expect.stringContaining('OPENAI_API_KEY') });
    });

    it('uses the saved default provider + model when nothing is requested', () => {
      const r = getSummarizeBackend({}, { backend: 'claude', model: 'claude-saved' });
      expect(r).toMatchObject({ backend: 'claude', model: 'claude-saved' });
    });

    it('a requested model wins; the saved model only applies to its own provider', () => {
      expect(getSummarizeBackend({ backend: 'claude', model: 'claude-picked' }, { backend: 'claude', model: 'claude-saved' }))
        .toMatchObject({ model: 'claude-picked' });
      expect(getSummarizeBackend({ backend: 'gemini' }, { backend: 'claude', model: 'claude-saved' }))
        .toMatchObject({ backend: 'gemini', model: config.GEMINI_MODEL });
    });

    it('asks for a model when the provider has neither a pick nor an env default', () => {
      const key = jest.replaceProperty(config, 'OPENAI_API_KEY', 'sk-test');
      const r = getSummarizeBackend({ backend: 'openai' });
      key.restore();
      expect(r).toEqual({ error: expect.stringContaining('OPENAI_MODEL') });
    });
  });
});
