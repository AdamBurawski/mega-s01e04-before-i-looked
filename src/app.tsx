import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { openNight } from './digest/types.js';
import { lane } from './lane.js';
import { nightsOnDisk, readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard, type NightLink } from './views/status.js';

function nightLinks(config: RigConfig): NightLink[] {
  return nightsOnDisk(config.runsDir).map((night) => {
    const digest = openNight(config.runsDir, night);
    return {
      night,
      ok: digest?.counts.ok ?? 0,
      retry: digest?.counts.retry ?? 0,
      fail: digest?.counts.fail ?? 0,
    };
  });
}

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} nights={nightLinks(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = openNight(config.runsDir, night);
    if (!digest) return c.notFound();
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const digest = openNight(config.runsDir, c.req.param('night'));
    if (!digest) return c.notFound();
    return c.json({ rows: digest.rows, badLines: digest.badLines });
  });

  return app;
}
