// Plain SQL migration runner, no ORM. Loads env from .env.local (preferred
// for local dev) falling back to .env, then runs every .sql file in
// migrations/ in filename order.
//
// The neon() HTTP driver's tagged-template function only takes a literal
// template, not an arbitrary string, so a multi-statement file can't be
// passed straight through as `sql\`${fileContents}\``. Instead we split on
// ";" and run each statement through sql.query(), the driver's escape hatch
// for query text that isn't a template literal. That's safe here because
// this migration file has no semicolons inside string literals or comments.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (checked .env.local and .env)");
  }
  const sql = neon(databaseUrl);

  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Running ${file}...`);
    const contents = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const statements = contents
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await sql.query(statement);
    }
  }

  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
