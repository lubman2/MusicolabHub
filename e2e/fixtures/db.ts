import { Client } from "pg";

let cached: Client | null = null;

/**
 * Lazily-connected pg Client for fixture/setup work.
 *
 * Tests don't import the app's Prisma client directly: the generated client
 * is ESM-only (uses `import.meta.url`) and Playwright loads tests as CJS.
 * Fixtures use raw SQL through `pg` to stay framework-agnostic.
 */
export async function getDb(): Promise<Client> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. E2E tests require a Postgres database (see TESTING.md).",
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  cached = client;
  return cached;
}

export async function closeDb(): Promise<void> {
  if (cached) {
    await cached.end();
    cached = null;
  }
}
