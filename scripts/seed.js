import { config } from '../src/config.js';
import { open, migrate, seedDemoData } from '../src/db.js';

const db = open(config.databaseUrl, { migrateOnOpen: false, seed: false });
try {
  migrate(db);
  seedDemoData(db);
  console.log(`Seeded reference accounts and labs into ${config.databaseUrl}`);
} finally {
  db.close();
}
