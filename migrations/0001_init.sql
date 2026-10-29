-- Initial schema. Never edit an applied migration: add 0002_*.sql instead.

-- Small singleton values (owner, encrypted secrets, conversation state).
-- value is JSON; secrets are AES-GCM sealed by src/crypto.ts before they get here.
CREATE TABLE kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
