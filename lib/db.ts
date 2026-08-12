import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// neon() opens an HTTP connection per query rather than a persistent TCP
// socket. That's the point: Vercel functions are short-lived and can spin up
// many concurrent instances, and node-postgres-style TCP connections don't
// pool well across that — you either exhaust Postgres' connection limit or
// need an external pooler (PgBouncer/Neon's own pooler proxy). The HTTP
// driver sidesteps this entirely since each query is a stateless fetch(),
// which is why it's the documented choice for serverless/edge functions.
// The tradeoff: no session state (no multi-statement transactions on this
// client) and one round trip per query, which is irrelevant at this app's
// scale (single-row lookups, a handful of upserts per sync).

// neon() validates its connection string argument synchronously and throws
// if it's missing — confirmed by testing it directly. That's a problem
// combined with `export const sql = neon(...)` at module scope: `next
// build` imports every route/page module during its page-data-collection
// pass to read their exports, regardless of whether the route is static or
// force-dynamic, which means that throw fires during the build itself in
// any environment where DATABASE_URL isn't already set (e.g. a local build
// without .env.local). On Vercel this happens to be harmless since the Neon
// integration sets DATABASE_URL for both build and runtime — but relying on
// that coincidence would make local builds fail for a reason unrelated to
// the code. Lazily constructing the client on first query call defers the
// check to request time instead, where the env var is actually needed.
let client: NeonQueryFunction<false, false> | undefined;

function getClient(): NeonQueryFunction<false, false> {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}

// Reproduces neon()'s tagged-template calling convention (sql`select ...`)
// without eagerly constructing the underlying client — see above.
export const sql: NeonQueryFunction<false, false> = ((
  strings: TemplateStringsArray,
  ...values: unknown[]
) => getClient()(strings, ...values)) as NeonQueryFunction<false, false>;
