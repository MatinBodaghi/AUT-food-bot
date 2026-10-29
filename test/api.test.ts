import { describe, expect, it } from "vitest";

import { verifyInitData } from "../src/api";

const BOT_TOKEN = "123456789:AAExampleTokenForTests";

async function sign(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** Build a valid initData string the same way Telegram does. */
async function makeInitData(authDate: number, user = { id: 42, first_name: "Tester" }) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAExample",
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = await sign(new TextEncoder().encode("WebAppData"), BOT_TOKEN);
  const hash = toHex(await sign(secret, dataCheckString));
  params.set("hash", hash);
  return params.toString();
}

const now = () => Math.floor(Date.now() / 1000);

describe("verifyInitData", () => {
  it("accepts a correctly signed payload", async () => {
    const initData = await makeInitData(now());
    await expect(verifyInitData(initData, BOT_TOKEN)).resolves.toMatchObject({ id: 42 });
  });

  it("rejects a tampered payload", async () => {
    const initData = await makeInitData(now());
    const tampered = initData.replace("Tester", "Attacker");
    await expect(verifyInitData(tampered, BOT_TOKEN)).rejects.toThrow(/signature/);
  });

  it("rejects a different bot token", async () => {
    const initData = await makeInitData(now());
    await expect(verifyInitData(initData, "999:other")).rejects.toThrow(/signature/);
  });

  it("rejects stale initData", async () => {
    const initData = await makeInitData(now() - 90_000);
    await expect(verifyInitData(initData, BOT_TOKEN)).rejects.toThrow(/expired/);
  });

  it("rejects an empty payload", async () => {
    await expect(verifyInitData("", BOT_TOKEN)).rejects.toThrow(/missing/);
  });
});
