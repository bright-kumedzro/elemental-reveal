// Neon Postgres (connected through the Vercel Marketplace, which provides DATABASE_URL).
// The driver is a devDependency so people installing the library from npm never get it.
import { neon } from '@neondatabase/serverless';

export const configured = Boolean(process.env.DATABASE_URL);

let sql = null, ready = null;

/** The query function, with the two tables created on first use. */
export async function db() {
  sql ||= neon(process.env.DATABASE_URL);
  ready ||= Promise.all([
    sql`create table if not exists wtd_sites (
      site text primary key,
      first_seen timestamptz not null default now(),
      last_seen timestamptz not null default now(),
      loads bigint not null default 1
    )`,
    sql`create table if not exists wtd_daily (
      day date not null,
      site text not null,
      effect text not null,
      version text not null,
      loads integer not null default 1,
      primary key (day, site, effect, version)
    )`,
  ]).catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}
