import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/tursodatabase/migrator';
import { db } from './db.js';

try {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
  console.log('Database migrations applied.');
} finally {
  await db.$client.close();
}
