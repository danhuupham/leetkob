import { open, USERS } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';

const db = open();
const server = createApp(db).listen(config.port, () => {
  console.log(
    `LeeTKOB slice on http://localhost:${config.port}: in-memory data, reset on every start`,
  );
  console.log('tokens:  ' + USERS.map((u) => `${u.name}=${u.token}`).join('  '));
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
