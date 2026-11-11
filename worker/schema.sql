-- Orders database for The Original Dublin Christmas Trees (Cloudflare D1, SQLite).
-- Apply once:  npx wrangler d1 execute dublin-trees-orders --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS reservations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ref          TEXT NOT NULL UNIQUE,                 -- what the customer is told and what goes on the certificate, e.g. R-7KQ2MX
  created_at   TEXT NOT NULL,                        -- ISO time, UTC
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  interests    TEXT NOT NULL,                        -- "Christmas tree, Tree sponsorship"
  tree         TEXT,                                 -- the Celtic tree chosen
  area         TEXT,                                 -- Dublin area or Eircode (optional)
  cert_name    TEXT,                                 -- name on the certificate or gift card
  cert_from    TEXT,
  cert_message TEXT,
  status       TEXT NOT NULL DEFAULT 'new',          -- new, confirmed, paid, done, cancelled
  notes        TEXT NOT NULL DEFAULT '',             -- the owner's private notes
  paid_eur     INTEGER NOT NULL DEFAULT 0,           -- payment received, in euro (15 per certificate); 0 = not paid yet
  paid_at      TEXT NOT NULL DEFAULT '',             -- when the payment was marked received (ISO time), '' = not paid
  consent_at   TEXT NOT NULL                         -- when the customer ticked the consent box
);
CREATE INDEX IF NOT EXISTS idx_reservations_created ON reservations(created_at DESC);

-- spam limits: a salted one-way hash (of the visitor's address range, or of an email address) and a count.
-- Each row carries its own expiry (unix seconds: an hour for addresses, a day for emails) and is deleted as soon as it has passed. No address is ever stored.
CREATE TABLE IF NOT EXISTS rate (
  key TEXT PRIMARY KEY,
  n   INTEGER NOT NULL,
  exp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_exp ON rate(exp);
