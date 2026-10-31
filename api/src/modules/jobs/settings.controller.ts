import { Controller, Get, Put, Body, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { SummarizeService } from '../summarize/summarize.service';
import { isSummarizeBackend, summarizeKey } from '../../credentials';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';

// Guarded: these routes use the server's provider keys. Local mode passes every request.
@UseGuards(JwtAuthGuard)
@Controller('api')
export class SettingsController {
  constructor(
    private readonly storage: StorageService,
    private readonly summarize: SummarizeService,
  ) {}

  // Default provider + model for summarize; the lecture page can still override per run.
  @Get('settings/summarize')
  getSummarizeDefault(@Res() res: Response) {
    res.json({ default: this.storage.getSummarizeDefault() });
  }

  @Put('settings/summarize')
  setSummarizeDefault(@Body() body: any, @Res() res: Response) {
    const { backend, model } = body ?? {};
    if (!isSummarizeBackend(backend)) return res.status(400).json({ error: 'backend must be gemini, claude or openai' });
    if (model != null && (typeof model !== 'string' || !model.trim())) {
      return res.status(400).json({ error: 'model must be a non-empty string or null' });
    }
    const value = { backend, model: model?.trim() ?? null };
    this.storage.setSummarizeDefault(value);
    res.json({ default: value });
  }

  // Live model list from the provider, recommended first. Needs that provider's key in api/.env.
  @Get('models/:backend')
  async listModels(@Param('backend') backend: string, @Res() res: Response) {
    if (!isSummarizeBackend(backend)) return res.status(400).json({ error: `Unknown backend: ${backend}` });
    const apiKey = summarizeKey(backend);
    if (!apiKey) return res.status(400).json({ error: `No API key for ${backend} in api/.env` });
    try {
      res.json({ models: await this.summarize.listModels(backend, apiKey) });
    } catch (err: any) {
      console.error(`[models] list error: ${backend}`, err?.message);
      res.status(502).json({ error: err?.message || 'Failed to list models' });
    }
  }
}
