import { open, USERS } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';

const db = open(config.databaseUrl);
const server = createApp(db).listen(config.port, () => {
  console.log(`LeeTKOB listening on http://localhost:${config.port} (db: ${config.databaseUrl})`);
  if (config.nodeEnv !== 'production') {
    console.log('dev tokens: ' + USERS.map((u) => `${u.name}=${u.token}`).join('  '));
  }
});

let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      try {
        db.close();
      } catch {
        // Ignore if already closed.
      }
      process.exit(0);
    });
    server.closeIdleConnections?.();
  });
}
