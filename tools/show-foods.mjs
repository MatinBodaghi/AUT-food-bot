import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "data", "captured", "rest1_current.html"), "utf8");

const regex = /<label[^>]+class="reserveFoodCheckBox"[^>]*>([\s\S]*?)<\/label>/gi;
let m;
const list = [];
while ((m = regex.exec(html)) !== null) {
  const text = m[1].replace(/<[^>]+>/g, "").trim();
  if (text) list.push(text);
}
console.log("Total food labels found:", list.length);
console.log(list);
