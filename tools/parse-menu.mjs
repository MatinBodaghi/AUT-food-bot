import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "data", "captured", "rest1_current.html"), "utf8");

const idx = html.indexOf("foodMainCnt");
if (idx !== -1) {
  console.log("Snippet from foodMainCnt:\n", html.slice(idx, idx + 2500));
}
