import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const fixtureRuns = join(dirname(fileURLToPath(import.meta.url)), '..', 'runs');
const configBase = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

function tempRuns(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function copyNight(dir: string, night: string) {
  writeFileSync(join(dir, `${night}.jsonl`), readFileSync(join(fixtureRuns, `${night}.jsonl`)));
}

describe('digest routes', () => {
  it('renders 2026-10-28 and returns the same jobs as JSON', async () => {
    const runsDir = tempRuns();
    copyNight(runsDir, '2026-10-28');
    const app = createApp({ ...configBase, runsDir });

    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('digest/render');
    expect(html).toContain('—');
    expect(html).toContain('quota exceeded');

    const json = await app.request('/api/digest/2026-10-28');
    expect(json.status).toBe(200);
    const body = (await json.json()) as { rows: DigestRow[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    const positions = body.rows.map((row) => html.indexOf(row.job));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('returns 404 when the night has no file', async () => {
    const app = createApp({ ...configBase, runsDir: tempRuns() });
    const page = await app.request('/digest/2026-01-02');
    const json = await app.request('/api/digest/2026-01-02');
    expect(page.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('renders an empty night as nothing ran', async () => {
    const runsDir = tempRuns();
    writeFileSync(join(runsDir, '2026-01-03.jsonl'), '');
    const app = createApp({ ...configBase, runsDir });
    const page = await app.request('/digest/2026-01-03');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('nothing ran');
    const json = await app.request('/api/digest/2026-01-03');
    expect(await json.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('renders a night that contains a bad line', async () => {
    const runsDir = tempRuns();
    writeFileSync(
      join(runsDir, '2026-01-04.jsonl'),
      '{"at":"2026-01-04T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n{not json\n',
    );
    const app = createApp({ ...configBase, runsDir });
    const page = await app.request('/digest/2026-01-04');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('1 unreadable');
    const json = await app.request('/api/digest/2026-01-04');
    const body = (await json.json()) as { rows: DigestRow[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(['lane/sync']);
  });

  it('links both nights on disk to a digest that renders', async () => {
    const runsDir = tempRuns();
    copyNight(runsDir, '2026-10-27');
    copyNight(runsDir, '2026-10-28');
    const app = createApp({ ...configBase, runsDir });
    const board = await app.request('/');
    const html = await board.text();
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 10 · retry 4 · fail 1');
    expect(html).toContain('ok 7 · retry 0 · fail 0');
    for (const night of ['2026-10-27', '2026-10-28']) {
      const page = await app.request(`/digest/${night}`);
      expect(page.status).toBe(200);
    }
  });
});
