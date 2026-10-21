import {
  KANBAN_COLUMNS,
  columnForStatus,
  type Application,
  type ApplicationStatus,
  type KanbanColumn,
} from '@joblume/shared';

export type QueueTab = 'pending' | 'ready' | 'skipped';

export function sortByScore<T extends { match_score: number | null; created_at: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => (b.match_score ?? -1) - (a.match_score ?? -1) || b.created_at.localeCompare(a.created_at),
  );
}

/** When the source says the job was posted, else when the application was created. */
export const postedKey = (a: { created_at: string; job?: { posted_at?: string | null } | null }): string => a.job?.posted_at ?? a.created_at;

const timeOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Newest posting first; a tie goes to the better match, then the newer application. Does not change the input. */
export function sortNewest<T extends { match_score: number | null; created_at: string; job?: { posted_at?: string | null } | null }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      timeOf(postedKey(b)) - timeOf(postedKey(a)) ||
      (b.match_score ?? -1) - (a.match_score ?? -1) ||
      timeOf(b.created_at) - timeOf(a.created_at),
  );
}

export function queueTab(status: ApplicationStatus): QueueTab | null {
  if (status === 'pending_review') return 'pending';
  if (status === 'approved') return 'ready';
  if (status === 'skipped') return 'skipped';
  return null;
}

export function splitQueue(apps: Application[]): Record<QueueTab, Application[]> {
  const out: Record<QueueTab, Application[]> = { pending: [], ready: [], skipped: [] };
  for (const app of sortNewest(apps)) {
    const tab = queueTab(app.status);
    if (tab) out[tab].push(app);
  }
  // Pending is the long list to work through: ones with an email or WhatsApp number to reach come first (the newest-first order is the tiebreaker).
  out.pending = sortContactFirst(out.pending);
  return out;
}

/** The application after `currentId` in `list` that is still open (waiting for review or ready to apply), or null. Only reads: it never changes anything. */
export function nextInQueue<T extends { id: string; status: ApplicationStatus }>(list: T[], currentId: string): T | null {
  const at = list.findIndex((a) => a.id === currentId);
  if (at < 0) return null;
  for (let i = at + 1; i < list.length; i++) {
    const item = list[i]!;
    if (item.status === 'pending_review' || item.status === 'approved') return item;
  }
  return null;
}

export function groupByColumn(apps: Application[]): Record<KanbanColumn, Application[]> {
  const out = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c, [] as Application[]])) as Record<KanbanColumn, Application[]>;
  for (const app of sortByScore(apps)) {
    const column = columnForStatus(app.status);
    if (column) out[column].push(app);
  }
  return out;
}

const APPLIED_FAMILY: ApplicationStatus[] = ['applied', 'interviewing', 'rejected', 'offer'];
const FOLLOW_UP_MS = 3 * 86_400_000;

/** Mirrors the server's status side effects so optimistic updates look right until the server answers. */
export function applyStatusLocal<T extends Application>(apps: T[], id: string, status: ApplicationStatus, now: Date = new Date()): T[] {
  return apps.map((app) => {
    if (app.id !== id) return app;
    if (!APPLIED_FAMILY.includes(status)) return { ...app, status, applied_at: null, follow_up_at: null };
    if (app.applied_at) return { ...app, status };
    return {
      ...app,
      status,
      applied_at: now.toISOString(),
      follow_up_at: new Date(now.getTime() + FOLLOW_UP_MS).toISOString(),
      apply_method: app.apply_method ?? 'assisted',
    };
  });
}

/** The status to set when `activeId` is dropped on `overId`, or null when nothing should change. */
export function resolveDrop(apps: Application[], activeId: string, overId: string | null): ApplicationStatus | null {
  if (!overId || !(KANBAN_COLUMNS as readonly string[]).includes(overId)) return null;
  const app = apps.find((a) => a.id === activeId);
  if (!app) return null;
  const target = overId as KanbanColumn;
  return columnForStatus(app.status) === target ? null : target;
}

export function previewText(text: string | null, max = 220): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max).trimEnd()}…`;
}

export function scoreTone(score: number | null): 'high' | 'mid' | 'low' | 'none' {
  if (score === null) return 'none';
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

export const MIN_CV_CHARS = 50;
const MAX_CV_CHARS = 30_000;
const MAX_LETTER_CHARS = 10_000;

export function buildTextPatch(
  original: { cv: string | null; letter: string | null },
  current: { cv: string; letter: string },
): {
  patch: { tailored_cv_text?: string; cover_letter_text?: string };
  errors: { cv?: string; letter?: string };
  dirty: boolean;
} {
  const patch: { tailored_cv_text?: string; cover_letter_text?: string } = {};
  const errors: { cv?: string; letter?: string } = {};

  if (current.cv !== (original.cv ?? '')) {
    patch.tailored_cv_text = current.cv;
    if (current.cv.length < MIN_CV_CHARS) errors.cv = `The CV must be at least ${MIN_CV_CHARS} characters.`;
    else if (current.cv.length > MAX_CV_CHARS) errors.cv = 'The CV is too long.';
  }
  if (current.letter !== (original.letter ?? '')) {
    patch.cover_letter_text = current.letter;
    if (current.letter.trim() === '') errors.letter = 'The cover letter cannot be empty.';
    else if (current.letter.length > MAX_LETTER_CHARS) errors.letter = 'The cover letter is too long.';
  }
  return { patch, errors, dirty: Object.keys(patch).length > 0 };
}

/** Mean match score of the applications that have one, or null when none do. */
export function averageScore(apps: { match_score: number | null }[]): number | null {
  const scores = apps.map((a) => a.match_score).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10;
}

export type ApplyMethod = 'email' | 'whatsapp' | 'site';

export const APPLY_METHOD_LABELS: Record<ApplyMethod, string> = { email: 'Email', whatsapp: 'WhatsApp', site: 'Employer site' };

/** How the user can reach this employer: an email wins over WhatsApp, and with neither it is the employer's site. */
export function applyMethod(app: {
  email_candidates?: unknown[] | null;
  hiring_manager_email?: string | null;
  whatsapp_number?: string | null;
}): ApplyMethod {
  if ((app.email_candidates?.length ?? 0) > 0 || (app.hiring_manager_email ?? '').trim() !== '') return 'email';
  if ((app.whatsapp_number ?? '').trim() !== '') return 'whatsapp';
  return 'site';
}

const WHATSAPP_MESSAGE_CHARS = 300;

/** A wa.me chat link with the start of the cover letter as the message, or null unless the number is 7 to 15 digits only. Never sends anything. */
export function whatsappLink(number: string | null | undefined, coverLetter: string | null | undefined): string | null {
  if (!number || !/^\d{7,15}$/.test(number)) return null;
  // Cut by code points, so an emoji is never split; a lone surrogate would make encodeURIComponent throw.
  const text = Array.from((coverLetter ?? '').replace(/\s+/g, ' ').trim()).slice(0, WHATSAPP_MESSAGE_CHARS).join('');
  try {
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  } catch {
    return `https://wa.me/${number}`;
  }
}

/** The "Has email" queue chip: keeps applications whose apply method is email. */
export const withEmail = <T extends Parameters<typeof applyMethod>[0]>(apps: T[]): T[] => apps.filter((a) => applyMethod(a) === 'email');

/** Moves applications that have an email or WhatsApp number ahead of the rest. Stable: each group keeps its incoming order. Does not change the input. */
export function sortContactFirst<T extends Parameters<typeof applyMethod>[0]>(items: T[]): T[] {
  return [...items.filter((a) => applyMethod(a) !== 'site'), ...items.filter((a) => applyMethod(a) === 'site')];
}
