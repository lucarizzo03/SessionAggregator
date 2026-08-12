// Plain SQL migration runner, no ORM. Loads env from .env.local (preferred
// for local dev) falling back to .env, then runs every .sql file in
// migrations/ in filename order.
//
// The neon() HTTP driver's tagged-template function only takes a literal
// template, not an arbitrary string, so a multi-statement file can't be
// passed straight through as `sql\`${fileContents}\``. Instead we strip
// "--" line comments and split what's left on ";", running each statement
// through sql.query(), the driver's escape hatch for query text that isn't
// a template literal. Comments have to be stripped first, not just skipped
// during the split: a semicolon inside a comment (e.g. "...documented;
// perception_analysis is...") previously fooled the naive split into
// treating the comment's tail as a new statement, so this now removes
// comment text before splitting rather than trusting comments to stay
// semicolon-free.
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
    // Drop everything from "--" to end of line before splitting, so
    // punctuation inside comments (like this file's prose) can't be
    // mistaken for a statement boundary. Safe here since the migration
    // files have no string literals containing "--".
    const withoutComments = contents
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    const statements = withoutComments
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
