// All persistent state, in D1 (schema: migrations/). The only module that writes SQL.
// Like the courses bot: small JSON values in a `kv` table, secrets encrypted with
// AES-GCM under TOKEN_KEY, so a database export alone reveals nothing usable.

import { decrypt, encrypt } from "./crypto";

export interface AutCredentials {
  username: string;
  password: string;
}

/** Typed keys of the `kv` table. Add new keys here; values are stored as JSON. */
export interface KvValues {
  /** Telegram user id allowed to use the bot (first /start claims it). */
  owner_id: number;
  /** User-specific group id used by the reserve endpoints. */
  person_group_id: number;
  /** Encrypted JSON of AutCredentials. */
  aut_credentials: string;
  /** Encrypted JSON of the serialized CookieJar. */
  aut_session: string;
  /** Login conversation state. */
  login_step: "username" | "password";
  /** Temporary value while the login conversation is running. */
  login_username: string;
  /** unix time of the last successful AUT login. */
  aut_logged_in_at: number;
}

const now = () => Math.floor(Date.now() / 1000);

export class Store {
  constructor(private readonly db: D1Database, private readonly tokenKey: string) {}

  async get<K extends keyof KvValues>(key: K): Promise<KvValues[K] | null> {
    const row = await this.db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .bind(key)
      .first<{ value: string }>();
    return row ? (JSON.parse(row.value) as KvValues[K]) : null;
  }

  async set<K extends keyof KvValues>(key: K, value: KvValues[K]): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO kv (key, value, updated_at) VALUES (?1, ?2, ?3) " +
          "ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
      )
      .bind(key, JSON.stringify(value), now())
      .run();
  }

  async delete(...keys: (keyof KvValues)[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db.batch(keys.map((key) => this.db.prepare("DELETE FROM kv WHERE key = ?").bind(key)));
  }

  async getCredentials(): Promise<AutCredentials | null> {
    const sealed = await this.get("aut_credentials");
    return sealed ? (JSON.parse(await decrypt(sealed, this.tokenKey)) as AutCredentials) : null;
  }

  async setCredentials(credentials: AutCredentials): Promise<void> {
    await this.set("aut_credentials", await encrypt(JSON.stringify(credentials), this.tokenKey));
    await this.set("aut_logged_in_at", now());
  }

  async getSession(): Promise<string | null> {
    const sealed = await this.get("aut_session");
    return sealed ? decrypt(sealed, this.tokenKey) : null;
  }

  async setSession(serializedJar: string): Promise<void> {
    await this.set("aut_session", await encrypt(serializedJar, this.tokenKey));
  }
}
