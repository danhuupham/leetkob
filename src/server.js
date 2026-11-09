import { open, USERS } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3007);
const db = open();
const server = createApp(db).listen(port, () => {
  console.log(`LeeTKOB slice on http://localhost:${port}: in-memory data, reset on every start`);
  console.log('tokens:  ' + USERS.map((u) => `${u.name}=${u.token}`).join('  '));
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
