import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import nodemailer from 'nodemailer';
import * as config from '../src/config';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { LecturesModule } from '../src/modules/lectures/lectures.module';
import { EmailService } from '../src/modules/email/email.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { truncateAll, cleanClassesDir } from './helpers/db';
import { authCookie } from './helpers/auth';

jest.mock('nodemailer');
const sendMail = jest.fn();
(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

const USER = 'user-a';

describe('Summary mail', () => {
  let app: INestApplication;
  let storage: StorageService;
  let email: EmailService;
  let classId: string;
  let lectureId: string;
  const cookie = authCookie(USER);
  const put = (url: string) => request(app.getHttpServer()).put(url).set('Cookie', cookie);
  const post = (url: string) => request(app.getHttpServer()).post(url).set('Cookie', cookie);
  const resend = () => post(`/api/classes/${classId}/lectures/${lectureId}/email`);

  const smtpOn = () => [
    jest.replaceProperty(config, 'SMTP_HOST', 'smtp.test'),
    jest.replaceProperty(config, 'SMTP_USER', 'me@test'),
    jest.replaceProperty(config, 'SMTP_PASS', 'secret'),
  ];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [JobsModule, LecturesModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    storage = module.get(StorageService);
    email = module.get(EmailService);
  });
  afterAll(() => app.close());

  beforeEach(() => {
    truncateAll();
    cleanClassesDir();
    sendMail.mockReset().mockResolvedValue({});
    classId = storage.createClass({ name: 'Algebra' }, USER).id;
    lectureId = storage.createLecture(classId, { name: 'Lecture 1', url: 'http://x' }).id;
    storage.saveSummaryVersion(classId, lectureId, 'The <summary>', 'gemini', undefined, 'P');
    storage.updateLectureMeta(classId, lectureId, { status: 'summarized' });
  });
  afterEach(() => jest.restoreAllMocks());

  describe('recipient setting', () => {
    it('saves, clears and validates a single address', async () => {
      expect((await put('/api/settings/email').send({ recipient: ' a@b.co ' })).body).toEqual({ recipient: 'a@b.co' });
      expect(storage.getMailRecipient()).toBe('a@b.co');
      expect((await put('/api/settings/email').send({ recipient: 'a@b.co, c@d.co' })).status).toBe(400);
      expect((await put('/api/settings/email').send({ recipient: 'nope' })).status).toBe(400);
      expect((await put('/api/settings/email').send({ recipient: '' })).body).toEqual({ recipient: null });
      expect(storage.getMailRecipient()).toBeNull();
    });
  });

  describe('sendAfterSummarize', () => {
    it('sends once with summary + UI link, records emailSentAt, and does not resend', async () => {
      smtpOn(); storage.setMailRecipient('me@home.co');
      await email.sendAfterSummarize(classId, lectureId);
      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail).toMatchObject({ to: 'me@home.co', subject: 'Algebra – Lecture 1' });
      expect(mail.text).toContain('The <summary>');
      expect(mail.html).toContain('The &lt;summary&gt;');
      expect(mail.text).toContain(`/classes/${classId}/lectures/${lectureId}`);
      expect(storage.getLecture(classId, lectureId).emailSentAt).toBeTruthy();

      await email.sendAfterSummarize(classId, lectureId); // e.g. after a re-summarize
      expect(sendMail).toHaveBeenCalledTimes(1);
    });

    it('is skipped with no recipient or no SMTP keys', async () => {
      smtpOn();
      await email.sendAfterSummarize(classId, lectureId);
      jest.restoreAllMocks(); storage.setMailRecipient('me@home.co');
      await email.sendAfterSummarize(classId, lectureId);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('keeps the lecture summarized and stores lastEmailError when SMTP fails', async () => {
      smtpOn(); storage.setMailRecipient('me@home.co');
      sendMail.mockRejectedValue(new Error('auth failed'));
      await expect(email.sendAfterSummarize(classId, lectureId)).resolves.toBeUndefined();
      expect(storage.getLecture(classId, lectureId)).toMatchObject({ status: 'summarized', emailSentAt: null, lastEmailError: 'auth failed' });
    });
  });

  describe('POST …/email (send again)', () => {
    it('resends even when already sent, and updates emailSentAt', async () => {
      smtpOn(); storage.setMailRecipient('me@home.co');
      storage.updateLectureMeta(classId, lectureId, { emailSentAt: '2020-01-01T00:00:00.000Z' });
      const r = await resend();
      expect(r.status).toBe(200);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(storage.getLecture(classId, lectureId).emailSentAt).toBe(r.body.sentAt);
    });

    it('400 without recipient, 400 without SMTP keys, 502 on SMTP failure', async () => {
      smtpOn();
      expect((await resend()).status).toBe(400);
      jest.restoreAllMocks(); storage.setMailRecipient('me@home.co');
      expect((await resend()).status).toBe(400);
      smtpOn(); sendMail.mockRejectedValue(new Error('down'));
      const r = await resend();
      expect(r.status).toBe(502);
      expect(r.body.error).toBe('down');
    });

    it("404s for another user's class", async () => {
      const r = await request(app.getHttpServer()).post(`/api/classes/${classId}/lectures/${lectureId}/email`).set('Cookie', authCookie('user-b'));
      expect(r.status).toBe(404);
    });
  });

  it('POST /api/settings/email/test sends a test mail to the recipient', async () => {
    smtpOn(); storage.setMailRecipient('me@home.co');
    expect((await post('/api/settings/email/test')).status).toBe(200);
    expect(sendMail.mock.calls[0][0].to).toBe('me@home.co');
  });
});
