import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

const runsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'runs');

describe('run log reader', () => {
  it('reads 2026-10-28 as 5 jobs and 1 bad line', () => {
    const night = readNight(runsDir, '2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const render = night.rows[0];
    expect(render.owner).toBeNull();
    expect(render.runs).toBe(1);
    expect(render.retries).toBe(0);
    expect(render.lastStatus).toBe('ok');
    expect(render.lastError).toBeNull();

    const refresh = night.rows[1];
    expect(refresh.runs).toBe(4);
    expect(refresh.retries).toBe(3);
    expect(refresh.lastStatus).toBe('ok');
    expect(refresh.lastError).toBeNull();
    expect(refresh.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh.lastAt).toBe('2026-10-29T01:37:00+01:00');

    const sync = night.rows[2];
    expect(sync.runs).toBe(8);
    expect(sync.retries).toBe(1);
    expect(sync.lastStatus).toBe('ok');
    expect(sync.owner).toBe('rook');
    expect(sync.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(sync.lastAt).toBe('2026-10-29T05:00:04+01:00');

    const backup = night.rows[3];
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');
    expect(backup.owner).toBe('lane-07');

    const raw = readFileSync(join(runsDir, '2026-10-28.jsonl'), 'utf8');
    expect(raw.trimEnd().split('\n').at(-1)?.endsWith('}')).toBe(false);
  });
});
