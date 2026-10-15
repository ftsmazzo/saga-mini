import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const ddl = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
await sql.unsafe(ddl);
await sql.end();
console.log("schema saga-mini aplicado");
