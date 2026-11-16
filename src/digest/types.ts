import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type JobStatus = 'ok' | 'retry' | 'fail';

// One job over a night. Times stay as written in the log, offset included.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: JobStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
  counts: { ok: number; retry: number; fail: number };
};

type Event = {
  at: string;
  job: string;
  status: JobStatus;
  owner: string | null;
  error?: string;
};

const STATUSES = new Set<JobStatus>(['ok', 'retry', 'fail']);

function parseLine(line: string): Event | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.at !== 'string' || typeof row.job !== 'string') return null;
  if (typeof row.status !== 'string' || !STATUSES.has(row.status as JobStatus)) return null;
  if (!(typeof row.owner === 'string' || row.owner === null)) return null;
  if (row.error !== undefined && typeof row.error !== 'string') return null;
  return {
    at: row.at,
    job: row.job,
    status: row.status as JobStatus,
    owner: row.owner,
    ...(typeof row.error === 'string' ? { error: row.error } : {}),
  };
}

// Read runs/<night>.jsonl. A line that does not parse is counted, never thrown.
export function readNight(runsDir: string, night: string): NightDigest {
  const text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const events: Event[] = [];
  let badLines = 0;
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseLine(line);
    if (!event) {
      badLines += 1;
      continue;
    }
    counts[event.status] += 1;
    events.push(event);
  }

  const byJob = new Map<string, Event[]>();
  for (const event of events) {
    const group = byJob.get(event.job);
    if (group) group.push(event);
    else byJob.set(event.job, [event]);
  }

  const rows = [...byJob.entries()]
    .map(([job, group]) => {
      const ordered = [...group].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const last = ordered[ordered.length - 1];
      return {
        job,
        owner: last.owner,
        runs: ordered.length,
        retries: ordered.filter((event) => event.status === 'retry').length,
        lastStatus: last.status,
        lastError: last.error ?? null,
        firstAt: ordered[0].at,
        lastAt: last.at,
      };
    })
    .sort((a, b) => a.job.localeCompare(b.job));

  return { rows, badLines, counts };
}

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

// Missing night is undefined so the route can answer 404. Any other read error still throws.
export function openNight(runsDir: string, night: string): NightDigest | undefined {
  if (!NIGHT.test(night)) return undefined;
  try {
    return readNight(runsDir, night);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
