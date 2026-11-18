import { config } from '../src/config.js';
import { open, migrate } from '../src/db.js';

const db = open(config.databaseUrl, { migrateOnOpen: false, seed: false });
try {
  const applied = migrate(db);
  console.log(
    applied.length
      ? `Applied ${applied.length} migration(s): ${applied.join(', ')}`
      : 'Database schema is already up to date',
  );
} finally {
  db.close();
}
