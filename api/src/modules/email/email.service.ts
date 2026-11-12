import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { StorageService } from '../storage/storage.service';
import { getSmtpConfig, ENV_KEYS } from '../../credentials';
import { WEB_ORIGIN } from '../../config';

// 400 = the user can fix it (no recipient / SMTP keys / summary); 502 = SMTP itself failed.
export class MailError extends Error {
  constructor(message: string, readonly status: 400 | 502) { super(message); }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Summary mail: see GLOSSARY.md. Sent once per lecture after a successful summarize;
// the lecture page can send it again on demand.
@Injectable()
export class EmailService {
  constructor(private readonly storage: StorageService) {}

  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    const smtp = getSmtpConfig();
    if (!smtp) throw new MailError(`${ENV_KEYS.smtp} missing — set them in .env`, 400);
    try {
      await nodemailer
        .createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } })
        .sendMail({ from: smtp.from, to, subject, text, html });
    } catch (err: any) {
      throw new MailError(err?.message || 'SMTP send failed', 502);
    }
  }

  private requireRecipient(): string {
    const to = this.storage.getMailRecipient();
    if (!to) throw new MailError('No recipient — set one in Settings', 400);
    return to;
  }

  // Sends the lecture's current summary and records emailSentAt. Throws MailError.
  async deliverSummary(classId: string, lectureId: string): Promise<{ sentAt: string }> {
    const to = this.requireRecipient();
    const lecture = this.storage.getLecture(classId, lectureId);
    const cls = this.storage.getClass(classId);
    const summary = lecture && this.storage.getCurrentSummaryContent(classId, lectureId);
    if (!lecture || !cls || !summary) throw new MailError('No summary to send', 400);

    const link = `${WEB_ORIGIN}/classes/${classId}/lectures/${lectureId}`;
    const text = `${summary}\n\n${link}`;
    const html = `<div dir="rtl" style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(summary)}</div><p dir="rtl"><a href="${link}">${escapeHtml(lecture.name)}</a></p>`;
    try {
      await this.send(to, `${cls.name} – ${lecture.name}`, text, html);
    } catch (err: any) {
      this.storage.updateLectureMeta(classId, lectureId, { lastEmailError: err.message });
      throw err;
    }
    const sentAt = new Date().toISOString();
    this.storage.updateLectureMeta(classId, lectureId, { emailSentAt: sentAt, lastEmailError: null });
    return { sentAt };
  }

  // Post-summarize hook: never throws, never blocks the summarize. Mail off / not configured /
  // already sent → skipped silently. A failure leaves emailSentAt empty (see lastEmailError).
  async sendAfterSummarize(classId: string, lectureId: string): Promise<void> {
    if (!this.storage.getMailRecipient() || !getSmtpConfig()) return;
    if (this.storage.getLecture(classId, lectureId)?.emailSentAt) return;
    try {
      await this.deliverSummary(classId, lectureId);
    } catch (err: any) {
      console.error(`[email] failed: ${classId}/${lectureId}`, err.message);
    }
  }

  async sendTest(): Promise<void> {
    await this.send(this.requireRecipient(), 'Lecture Summarizer – test', 'Summary mails are set up.', '<p>Summary mails are set up.</p>');
  }
}
