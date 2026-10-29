// Text formatting for Persian UI: digits, Jalali dates (Tehran time), sizes, HTML escaping.

import type { InlineKeyboardButton, InlineKeyboardMarkup } from "@grammyjs/types";

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const MESSAGE_LIMIT = 4000;

export function fa(value: unknown): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!);
}

export function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let dateFmt: Intl.DateTimeFormat | undefined;

/** Unix seconds → "شنبه ۳ آبان ۱۴۰۵، ۱۴:۳۰" in Tehran time. */
export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  dateFmt ??= new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
    timeZone: "Asia/Tehran",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return dateFmt.format(ts * 1000);
}

export function truncate(text: string, limit = MESSAGE_LIMIT): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…`;
}

/** Today's Jalali date in YYYY/MM/DD, Tehran time (matches the reserve page). */
export function todayJalali(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year").replace(/\D/g, "")}/${get("month")}/${get("day")}`;
}

/** 350000 → "۳۵۰,۰۰۰ ریال"; null-ish stays a dash. */
export function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${fa(Math.abs(value).toLocaleString("en-US"))} ریال`;
}

// Keyboards
export type Button = InlineKeyboardButton;

export const btn = (text: string, data: string): Button => ({
  text: text.slice(0, 60),
  callback_data: data,
});

export const urlBtn = (text: string, url: string): Button => ({
  text: text.slice(0, 60),
  url,
});

/** Opens a Telegram Mini App from an inline button. */
export const webAppBtn = (text: string, url: string): Button => ({
  text: text.slice(0, 60),
  web_app: { url },
});

export const kb = (rows: (Button[] | null | undefined | false)[]): InlineKeyboardMarkup => ({
  inline_keyboard: rows.filter((r): r is Button[] => Array.isArray(r) && r.length > 0),
});
