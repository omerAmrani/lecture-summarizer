import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as config from '../src/config';
import { LecturesModule } from '../src/modules/lectures/lectures.module';
import { StorageService } from '../src/modules/storage/storage.service';
import { courseNumber } from '../src/modules/study/study.service';
import { truncateAll, cleanClassesDir } from './helpers/db';
import { authCookie } from './helpers/auth';

const USER = 'user-a';

describe('Send to study system', () => {
  let app: INestApplication;
  let storage: StorageService;
  let classId: string;
  let lectureId: string;
  let firstVersion: string;
  let fetchMock: jest.SpyInstance;
  const cookie = authCookie(USER);
  const send = (body: object = {}, user = USER) =>
    request(app.getHttpServer()).post(`/api/classes/${classId}/lectures/${lectureId}/study`).set('Cookie', authCookie(user)).send(body);
  const configured = () => [
    jest.replaceProperty(config, 'STUDY_SYSTEM_URL', 'https://study.test/api/lecture'),
    jest.replaceProperty(config, 'STUDY_PUSH_TOKEN', 'tok'),
  ];
  const answer = (status: number, body: object) =>
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({ imports: [LecturesModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    storage = module.get(StorageService);
  });
  afterAll(() => app.close());

  beforeEach(async () => {
    truncateAll();
    cleanClassesDir();
    fetchMock = jest.spyOn(global, 'fetch');
    classId = storage.createClass({ name: 'פסיכולוגיה פיזיולוגית', code: '10615' }, USER).id;
    lectureId = storage.createLecture(classId, { name: 'הרצאה 3', url: 'http://x', lectureDate: '2026-11-18' }).id;
    firstVersion = storage.saveSummaryVersion(classId, lectureId, 'v1', 'gemini', undefined, 'P');
    await new Promise((r) => setTimeout(r, 5));   // version ids are Date.now()
    storage.saveSummaryVersion(classId, lectureId, '**[00:05] נושא**\n- Sub-topic: טקסט', 'gemini', undefined, 'P');
    storage.updateLectureMeta(classId, lectureId, { status: 'summarized' });
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads the course number from the class code', () => {
    expect(courseNumber('10615')).toBe('10615');
    expect(courseNumber('קורס 10136 - מבוא')).toBe('10136');
    expect(courseNumber('12')).toBeNull();
    expect(courseNumber(null)).toBeNull();
  });

  it('sends course, lecture date and the current summary with the token, shows the counts, records studySentAt', async () => {
    configured();
    answer(200, { ok: true, passages: 4, duplicates: 1, notes: 1, suggestions: 2, sections: ['3.1'] });
    const res = await send();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ passages: 4, duplicates: 1, notes: 1, suggestions: 2, sections: ['3.1'] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://study.test/api/lecture');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ course: '10615', lecture_date: '2026-11-18', summary: '**[00:05] נושא**\n- Sub-topic: טקסט' });
    expect(storage.getLecture(classId, lectureId).studySentAt).toBeTruthy();
  });

  it('sends the version on screen and allows sending again', async () => {
    configured();
    answer(200, { ok: true, passages: 1, duplicates: 0, notes: 0, suggestions: 0 });
    expect((await send({ summaryId: firstVersion })).status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).summary).toBe('v1');
    expect((await send()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('400 without config, course number or lecture date — nothing sent', async () => {
    expect((await send()).status).toBe(400);
    configured();
    storage.updateLectureMeta(classId, lectureId, { lectureDate: null });
    expect((await send()).body.error).toContain('תאריך');
    storage.updateLectureMeta(classId, lectureId, { lectureDate: '2026-11-18' });
    storage.updateClassMeta(classId, { code: null });
    expect((await send()).body.error).toContain('מספר קורס');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('502 with study-system\'s error, stored as lastStudyError', async () => {
    configured();
    answer(400, { ok: false, error: 'no [mm:ss] timestamp lines in the summary; nothing loaded' });
    const res = await send();
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('timestamp');
    expect(storage.getLecture(classId, lectureId)).toMatchObject({ studySentAt: null, lastStudyError: expect.stringContaining('timestamp') });
  });

  it('404 for another user\'s class', async () => {
    expect((await send({}, 'user-b')).status).toBe(404);
    expect(cookie).toBeTruthy();
  });
});
