'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl, apiFetch } from '@/lib/api';
import { streamSSE } from '@/lib/sse';
import { Button } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { SEMESTER_HE } from '@/lib/status';
import {SEMESTER_ORDER, getSelectedSemester, setSelectedSemester} from '@/lib/selectedSemester';
import { useConfigStatus } from '@/lib/configStatus';
import type { CredentialId } from '@/lib/configStatus';
import { SummarizePicker, useSummarizeDefault } from '@/app/components/SummarizePicker';
import type { SummarizeChoice } from '@/app/components/SummarizePicker';

interface DataDirInfo {
  current: string;
  configured: string | null;
  hasDb: boolean;
}

interface ClassRow {
  id: string;
  name: string;
  opalCourseUrl?: string | null;
  semester?: string | null;
  year?: number | null;
}

interface NewLecture {
  id: string;
  name: string;
  url: string;
  status: string;
  lectureDate?: string | null;
}

interface SyncSection {
  classId: string;
  className: string;
  semester?: string | null;
  year?: number | null;
  newLectures: NewLecture[];
}

type ModelKey = 'gemini' | 'claude' | 'openai';
type ModelStatus = 'idle' | 'testing' | 'ok' | 'error' | 'warning';

interface ModelState {
  status: ModelStatus;
  msg: string;
  latency?: number;
  response?: string;
}

const MODELS: { key: ModelKey; emoji: string; name: string; sub: string; role: string }[] = [
  { key: 'gemini', emoji: 'G', name: 'Gemini', sub: 'Google', role: 'סיכומים' },
  { key: 'claude', emoji: 'C', name: 'Claude', sub: 'Anthropic', role: 'סיכומים' },
  { key: 'openai', emoji: 'O', name: 'OpenAI', sub: 'ChatGPT', role: 'סיכומים' },
];

// Read-only: credentials live in .env (docs/adr/0002); key names come from the API's status.
const ENV_KEYS: { id: CredentialId; label: string; getKey?: { url: string; hint: string } }[] = [
  { id: 'opal', label: 'האוניברסיטה הפתוחה' },
  { id: 'groq', label: 'Groq (תמלול)', getKey: { url: 'https://console.groq.com/keys', hint: 'חינמי · צרו מפתח והדביקו ב-.env' } },
  {
    id: 'gemini', label: 'Gemini (סיכום)',
    getKey: { url: 'https://aistudio.google.com/app/apikey', hint: 'יש מסלול חינמי · התחברו עם Google, צרו מפתח והדביקו ב-.env' },
  },
  { id: 'claude', label: 'Claude (סיכום)', getKey: { url: 'https://platform.claude.com/settings/keys', hint: 'בתשלום · צרו מפתח והדביקו ב-.env' } },
  { id: 'openai', label: 'OpenAI (סיכום)', getKey: { url: 'https://platform.openai.com/api-keys', hint: 'בתשלום · צרו מפתח והדביקו ב-.env' } },
];

export default function SettingsPage() {
  const [dataDir, setDataDir] = useState<DataDirInfo | null>(null);
  const [pendingDataDir, setPendingDataDir] = useState<string | null>(null);
  const [dataDirHasDb, setDataDirHasDb] = useState(false);
  const [dataDirResult, setDataDirResult] = useState<{ msg: string; error?: boolean } | null>(null);
  const [pickingDir, setPickingDir] = useState(false);
  const [savingDir, setSavingDir] = useState(false);
  const [reloadMsg, setReloadMsg] = useState('');
  const [reloading, setReloading] = useState(false);

  const [syncSections, setSyncSections] = useState<SyncSection[]>([]);
  const [selectedSemesterKey, setSelectedSemesterKey] = useState('');
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [models, setModels] = useState<Record<ModelKey, ModelState>>({
    gemini: { status: 'idle', msg: 'לא נבדק' },
    claude: { status: 'idle', msg: 'לא נבדק' },
    openai: { status: 'idle', msg: 'לא נבדק' },
  });

  const configStatus = useConfigStatus();
  const savedChoice = useSummarizeDefault(configStatus);
  const [pickedChoice, setPickedChoice] = useState<SummarizeChoice | null>(null);
  const choice = pickedChoice ?? savedChoice;
  const [defaultMsg, setDefaultMsg] = useState<{ msg: string; error?: boolean } | null>(null);

  const saveDefault = async () => {
    if (!choice) return;
    try {
      const r = await apiFetch('/api/settings/summarize', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(choice),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'שגיאה');
      setDefaultMsg({ msg: 'נשמר' });
    } catch (err) {
      setDefaultMsg({ msg: err instanceof Error ? err.message : 'שגיאה', error: true });
    }
  };

  const loadDataDir = useCallback(async () => {
    try {
      const data: DataDirInfo = await fetch(apiUrl('/api/data-dir')).then((r) => r.json());
      setDataDir(data);
    } catch { /* ignore */ }
  }, []);

  const semesterOptions = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; year: number; semester: string }>();
    for (const s of syncSections) {
      if (!s.semester || !s.year) continue;
      const key = `${s.semester}-${s.year}`;
      if (!seen.has(key)) seen.set(key, { key, label: `${SEMESTER_HE[s.semester] || s.semester} ${s.year}`, year: s.year, semester: s.semester });
    }
    return [...seen.values()].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return (SEMESTER_ORDER[b.semester] ?? 0) - (SEMESTER_ORDER[a.semester] ?? 0);
    });
  }, [syncSections]);

  const initSyncPanel = useCallback(async () => {
    try {
      const classes: ClassRow[] = await apiFetch('/api/classes').then((r) => r.json());
      const linked = classes.filter((c) => c.opalCourseUrl);
      setSyncSections(linked.map((cls) => ({
        classId: cls.id, className: cls.name, semester: cls.semester, year: cls.year, newLectures: [] as NewLecture[],
      })));
    } catch { /* ignore */ }
  }, []);

  const knownSemesterKeys = useRef<Set<string> | null>(null);

  useEffect(() => {
    const stored = getSelectedSemester();
    if (stored) setSelectedSemesterKey(stored);
  }, []);

  useEffect(() => {
    if (semesterOptions.length === 0) return;
    const currentKeys = new Set(semesterOptions.map((o) => o.key));
    const newest = semesterOptions[0]!;
    const isFirstLoad = knownSemesterKeys.current === null;
    const newestJustAppeared = !isFirstLoad && !knownSemesterKeys.current!.has(newest.key);
    knownSemesterKeys.current = currentKeys;

    if (newestJustAppeared) {
      setSelectedSemesterKey(newest.key);
    } else if (!currentKeys.has(selectedSemesterKey)) {
      setSelectedSemesterKey(newest.key);
    }
  }, [semesterOptions, selectedSemesterKey]);

  useEffect(() => {
    if (!selectedSemesterKey) return;
    setSelectedSemester(selectedSemesterKey);
    const selected = semesterOptions.find((o) => o.key === selectedSemesterKey);
    if (!selected) return;
    fetch(apiUrl('/api/classes/active-semester'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ semester: selected.semester, year: selected.year }),
    }).catch(() => { /* ignore — cron falls back to unfiltered until this succeeds */ });
  }, [selectedSemesterKey, semesterOptions]);

  const visibleSyncSections = useMemo(
    () => syncSections.filter((s) => `${s.semester}-${s.year}` === selectedSemesterKey),
    [syncSections, selectedSemesterKey],
  );

  useEffect(() => {
    loadDataDir();
    initSyncPanel();
  }, [loadDataDir, initSyncPanel]);

  const pickDataDir = async () => {
    setPickingDir(true);
    try {
      const data: { path?: string; hasDb?: boolean; cancelled?: boolean; error?: string } =
        await fetch(apiUrl('/api/data-dir/pick'), { method: 'POST' }).then((r) => r.json());
      if (data.cancelled) return;
      if (data.error) { setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true }); return; }
      if (data.path) { setPendingDataDir(data.path); setDataDirHasDb(!!data.hasDb); }
    } finally { setPickingDir(false); }
  };

  const saveDataDir = async () => {
    if (!pendingDataDir) return;
    setSavingDir(true);
    try {
      const data: { ok?: boolean; error?: string } = await fetch(apiUrl('/api/data-dir'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataDir: pendingDataDir }),
      }).then((r) => r.json());
      if (data.ok) { setDataDirResult({ msg: 'הנתיב נשמר. השרת מופעל מחדש...' }); setPendingDataDir(null); }
      else setDataDirResult({ msg: `שגיאה: ${data.error}`, error: true });
    } catch { setDataDirResult({ msg: 'שגיאת רשת', error: true }); }
    finally { setSavingDir(false); }
  };

  const reloadFromDisk = async () => {
    setReloading(true);
    setReloadMsg('טוען...');
    try {
      const data: { ok?: boolean; classes?: number; lectures?: number; error?: string } =
        await fetch(apiUrl('/api/reload-from-disk'), { method: 'POST' }).then((r) => r.json());
      if (data.ok) setReloadMsg(`שוחזר: ${data.classes} קורסים, ${data.lectures} הרצאות`);
      else setReloadMsg(`שגיאה: ${data.error}`);
    } catch { setReloadMsg('שגיאת רשת'); }
    finally { setReloading(false); }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncProgress('מתחיל...');
    try {
      const selected = semesterOptions.find((o) => o.key === selectedSemesterKey);
      const body = selected ? { semester: selected.semester, year: selected.year } : {};
      await streamSSE('/api/classes/sync', body, (ev) => {
        if (ev.type === 'progress') setSyncProgress(String(ev.message));
        else if (ev.type === 'class') {
          const classId = String(ev.classId);
          const newLectures = (ev.newLectures as NewLecture[]) || [];
          setSyncSections((prev) => prev.map((s) => s.classId === classId ? { ...s, newLectures } : s));
        } else if (ev.type === 'done') setSyncProgress('סיום בדיקה');
      });
    } catch (err) {
      setSyncProgress(`שגיאה: ${err instanceof Error ? err.message : 'שגיאה'}`);
    } finally { setSyncing(false); }
  };

  const testModel = async (key: ModelKey) => {
    setModels((m) => ({ ...m, [key]: { status: 'testing', msg: 'שולח בקשה...' } }));
    try {
      const data: { ok?: boolean; configured?: boolean; error?: string; ms?: number; response?: string } =
        await fetch(apiUrl(`/health/${key}`), { method: 'POST' }).then((r) => r.json());
      if (!data.configured) {
        setModels((m) => ({ ...m, [key]: { status: 'warning', msg: data.error || 'מפתח API לא מוגדר' } }));
      } else if (data.ok) {
        setModels((m) => ({ ...m, [key]: { status: 'ok', msg: 'תקין', latency: data.ms, response: data.response } }));
      } else {
        setModels((m) => ({ ...m, [key]: { status: 'error', msg: data.error || 'שגיאה' } }));
      }
    } catch (err) {
      setModels((m) => ({ ...m, [key]: { status: 'error', msg: err instanceof Error ? err.message : 'שגיאה' } }));
    }
  };

  const testAll = async () => { await Promise.all(MODELS.map((m) => testModel(m.key))); };

  return (
    <div className="page fade-in">
      <div className="settings-grid">
        {/* Detect-new sync card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">זיהוי הרצאות חדשות</div>
              <div className="set-card__sub">בודק את אזור הקורס מול OPAL</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {semesterOptions.length > 0 && (
                <Select
                  value={selectedSemesterKey}
                  onChange={setSelectedSemesterKey}
                  options={semesterOptions.map((o) => ({ value: o.key, label: o.label }))}
                />
              )}
              <Button onClick={runSync} disabled={syncing}>
                {syncing ? 'מחפש...' : '🔍 בדוק עכשיו'}
              </Button>
            </div>
          </div>

          {syncProgress && (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>{syncProgress}</div>
          )}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {visibleSyncSections.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                אין קורסים עם קישור OPAL לסמסטר הנבחר
              </div>
            ) : visibleSyncSections.every((s) => s.newLectures.length === 0) ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                לא נמצאו הרצאות חדשות בבדיקה האחרונה
              </div>
            ) : (
              visibleSyncSections.filter((s) => s.newLectures.length > 0).map((s) => (
                <div key={s.classId} style={{ marginBottom: 12 }}>
                  <div style={{ font: '600 0.85rem/1 var(--font-ui)', marginBottom: 6 }}>{s.className}</div>
                  <div style={{ font: '600 0.78rem/1 var(--font-ui)', color: 'var(--accent)', padding: '4px 0' }}>
                    נוספו — {s.newLectures.length} הרצאות
                  </div>
                  {s.newLectures.map((l) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderTop: '1px dashed var(--line-2)', fontSize: '0.85rem' }}>
                      <span style={{ flex: 1, color: 'var(--ink-2)' }}>{l.name}</span>
                    </div>
                  ))}
                </div>
              ))
            )}

          </div>
        </div>

        {/* Storage card */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">אחסון</div>
              <div className="set-card__sub">תמלולים, סיכומים, מטה-דאטה</div>
            </div>
            <Button onClick={pickDataDir} disabled={pickingDir}>
              {pickingDir ? 'פותח...' : '📁 שנה תיקייה'}
            </Button>
          </div>

          <div style={{ font: '0.85rem/1.5 var(--font-ui)', color: 'var(--muted)', marginBottom: 14 }}>
            תיקייה נוכחית:
            <div style={{ font: '0.82rem var(--font-mono)', color: 'var(--ink)', wordBreak: 'break-all', marginTop: 6, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
              {dataDir ? dataDir.current : '—'}
            </div>
          </div>

          {pendingDataDir && !dataDirHasDb && dataDir?.current && (
            <div style={{ marginBottom: 8, fontSize: '0.85rem', color: 'var(--warn)' }}>
              נתיב זה ריק. הנתונים הקיימים נשארים ב: {dataDir.current}
            </div>
          )}
          {pendingDataDir && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: 8 }}>נתיב נבחר: {pendingDataDir}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={saveDataDir} disabled={savingDir}>{savingDir ? 'שומר...' : 'שמור והפעל מחדש'}</Button>
                <Button onClick={() => setPendingDataDir(null)}>ביטול</Button>
              </div>
            </div>
          )}
          {dataDirResult && (
            <div style={{ fontSize: '0.85rem', color: dataDirResult.error ? 'var(--danger)' : 'var(--good)', marginBottom: 8 }}>
              {dataDirResult.msg}
            </div>
          )}

          <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <Button onClick={reloadFromDisk} disabled={reloading}>
              {reloading ? 'טוען...' : '♻️ שחזור מדיסק'}
            </Button>
            {reloadMsg && (
              <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)' }}>{reloadMsg}</div>
            )}
          </div>
        </div>

        {/* Credentials card — read-only status of the API's .env */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">פרטי גישה</div>
              <div className="set-card__sub">
                מוגדרים בקובץ <code>.env</code> — ערכו אותו והפעילו מחדש את השרת
              </div>
            </div>
          </div>
          {ENV_KEYS.map(({ id, label, getKey }) => {
            const set = configStatus ? configStatus[id] : null;
            const keys = configStatus?.envKeys?.[id];
            return (
              <div key={id} className="cred-field" data-testid={`cred-${id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="cred-field__label">
                    {getKey ? (
                      <a href={getKey.url} target="_blank" rel="noopener noreferrer" title={keys ? `${getKey.hint} (${keys})` : getKey.hint}>{label} ↗</a>
                    ) : label}
                  </div>
                  {keys && <div style={{ font: '0.78rem var(--font-mono)', color: 'var(--muted)' }}>{keys}</div>}
                </div>
                <span data-testid="cred-state">{set === null ? '—' : set ? '✅' : '❌'}</span>
              </div>
            );
          })}
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 8 }}>
            לתמלול נדרשים OPAL ו-Groq · לסיכום נדרש Gemini, Claude או OpenAI
          </div>
        </div>

        {/* AI Models */}
        <div className="set-card">
          <div className="set-card__h">
            <div>
              <div className="set-card__title">מודלי בינה מלאכותית</div>
              <div className="set-card__sub">סטטוס בזמן אמת · בדיקת זמינות וזמני תגובה</div>
            </div>
            <Button onClick={testAll}>▶ בדוק את כולם</Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }} data-testid="summarize-default">
            <label style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
              ברירת מחדל לסיכום · אפשר לבחור אחרת בכל הרצאה
            </label>
            {choice && (
              <SummarizePicker
                value={choice}
                onChange={(c) => { setPickedChoice(c); setDefaultMsg(null); }}
                status={configStatus}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button size="xs" onClick={saveDefault} disabled={!choice} data-testid="save-summarize-default">
                שמור ברירת מחדל
              </Button>
              {defaultMsg && (
                <span style={{ fontSize: '0.78rem', color: defaultMsg.error ? 'var(--error)' : 'var(--muted)' }}>
                  {defaultMsg.msg}
                </span>
              )}
            </div>
          </div>

          {MODELS.map(({ key, emoji, name, sub, role }) => {
            const m = models[key];
            const cls =
              m.status === 'ok' ? 'model model--ok' :
              m.status === 'error' ? 'model model--err' :
              m.status === 'warning' ? 'model model--warn' :
              'model';
            return (
              <div key={key} className={cls}>
                <div className="model__avatar">{emoji}</div>
                <div>
                  <div className="model__name">
                    {name}
                    <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--muted)', marginInlineStart: 6 }}>· {role}</span>
                  </div>
                  <div className="model__sub">{sub}</div>
                </div>
                <div className="model__stat">
                  {m.status === 'testing' ? (
                    <>
                      <strong style={{ color: 'var(--muted)' }}>...</strong>
                      <span>בודק...</span>
                    </>
                  ) : m.latency ? (
                    <>
                      <strong>{m.latency}<span style={{ fontWeight: 400, fontSize: '0.7em', color: 'var(--muted)' }}>ms</span></strong>
                      <span>{m.msg}</span>
                    </>
                  ) : (
                    <>
                      <strong style={{ color: m.status === 'warning' ? 'var(--warn)' : 'var(--muted)' }}>—</strong>
                      <span>{m.msg}</span>
                    </>
                  )}
                  <Button
                    size="xs"
                    style={{ marginTop: 8 }}
                    onClick={() => testModel(key)}
                    disabled={m.status === 'testing'}
                  >
                    {m.status === 'testing' ? 'בודק...' : m.status === 'idle' ? 'בדוק' : 'בדוק שנית'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
