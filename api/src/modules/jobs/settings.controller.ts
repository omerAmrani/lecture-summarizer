import { Controller, Get, Put, Post, Delete, Body, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { SummarizeService } from '../summarize/summarize.service';
import { isSummarizeBackend, summarizeKey } from '../../credentials';
import { DEFAULT_SUMMARY_PROMPT, validateSummaryPrompt } from '../summarize/backends/prompt';
import { EmailService, MailError } from '../email/email.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';

// Guarded: these routes use the server's provider keys. Local mode passes every request.
@UseGuards(JwtAuthGuard)
@Controller('api')
export class SettingsController {
  constructor(
    private readonly storage: StorageService,
    private readonly summarize: SummarizeService,
    private readonly email: EmailService,
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

  // Custom prompt for every summarize; null in storage = the Default prompt.
  @Get('settings/summarize-prompt')
  getSummarizePrompt(@Res() res: Response) {
    res.json(this.summarizePromptBody());
  }

  @Put('settings/summarize-prompt')
  setSummarizePrompt(@Body() body: any, @Res() res: Response) {
    const result = validateSummaryPrompt(body?.prompt);
    if ('error' in result) return res.status(400).json({ error: result.error });
    this.storage.setSummarizePrompt(result.prompt === DEFAULT_SUMMARY_PROMPT ? null : result.prompt);
    res.json(this.summarizePromptBody());
  }

  @Delete('settings/summarize-prompt')
  resetSummarizePrompt(@Res() res: Response) {
    this.storage.setSummarizePrompt(null);
    res.json(this.summarizePromptBody());
  }

  private summarizePromptBody() {
    const custom = this.storage.getSummarizePrompt();
    return { prompt: custom ?? DEFAULT_SUMMARY_PROMPT, default: DEFAULT_SUMMARY_PROMPT, isCustom: custom !== null };
  }

  // Recipient of summary mails (single address); null = mail off.
  @Get('settings/email')
  getMailRecipient(@Res() res: Response) {
    res.json({ recipient: this.storage.getMailRecipient() });
  }

  @Put('settings/email')
  setMailRecipient(@Body() body: any, @Res() res: Response) {
    const recipient = typeof body?.recipient === 'string' ? body.recipient.trim() : body?.recipient;
    if (recipient !== null && recipient !== '' && !(typeof recipient === 'string' && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(recipient))) {
      return res.status(400).json({ error: 'recipient must be a single email address, or empty to turn mail off' });
    }
    this.storage.setMailRecipient(recipient || null);
    res.json({ recipient: recipient || null });
  }

  @Post('settings/email/test')
  async sendTestMail(@Res() res: Response) {
    try {
      await this.email.sendTest();
      res.status(200).json({ ok: true });
    } catch (err: any) {
      res.status(err instanceof MailError ? err.status : 500).json({ error: err.message });
    }
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
