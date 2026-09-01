import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDrizzle = globalThis as unknown as {
  db?: ReturnType<typeof createDb>;
};

function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(process.env.DATABASE_URL, { max: 10 });
  return drizzle(client, { schema });
}

export const db = globalForDrizzle.db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDrizzle.db = db;
}

export { schema };
