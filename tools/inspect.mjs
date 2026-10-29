import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURE_DIR = join(ROOT, "data", "captured");

mkdirSync(CAPTURE_DIR, { recursive: true });

console.log("==================================================================");
console.log("🚀 در حال راه‌اندازی مرورگر و ناظر شبکه برای food.aut.ac.ir ...");
console.log("==================================================================");

let requestIndex = 0;
const capturedItems = [];

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: null,
  });

  const page = await context.newPage();

  // Network listener
  page.on("response", async (response) => {
    try {
      const request = response.request();
      const url = response.url();
      const method = request.method();
      const status = response.status();
      const resourceType = request.resourceType();

      // Only capture XHR, fetch, and document requests (skip images, css, fonts)
      if (["xhr", "fetch", "document"].includes(resourceType)) {
        requestIndex++;
        const headers = response.headers();
        const contentType = headers["content-type"] || "";

        let responseBody = "";
        let isJson = false;

        if (contentType.includes("application/json") || contentType.includes("text/")) {
          try {
            responseBody = await response.text();
            if (contentType.includes("application/json")) {
              isJson = true;
            }
          } catch {
            responseBody = "<could not read response body>";
          }
        }

        let postData = "";
        try {
          postData = request.postData() || "";
        } catch {
          postData = "";
        }

        const logEntry = {
          index: requestIndex,
          timestamp: new Date().toISOString(),
          url,
          method,
          status,
          resourceType,
          contentType,
          requestHeaders: request.headers(),
          requestPayload: postData,
          isJson,
          responseSample: responseBody.slice(0, 5000), // first 5KB
        };

        capturedItems.push({
          index: requestIndex,
          method,
          url,
          status,
          resourceType,
          contentType,
        });

        // Save individual response file if it's JSON or interesting
        const filename = `resp_${String(requestIndex).padStart(3, "0")}_${method}.json`;
        writeFileSync(join(CAPTURE_DIR, filename), JSON.stringify(logEntry, null, 2), "utf8");

        console.log(`[#${requestIndex}] ${method} (${status}) -> ${url.slice(0, 80)}`);
      }
    } catch (err) {
      // Ignore transient errors
    }
  });

  console.log("\n🌐 در حال باز کردن سایت food.aut.ac.ir ...");
  try {
    await page.goto("https://food.aut.ac.ir", { timeout: 60000, waitUntil: "domcontentloaded" });
  } catch (err) {
    console.log("تلاش برای باز کردن آدرس جایگزین samad.aut.ac.ir ...");
    try {
      await page.goto("https://samad.aut.ac.ir", { timeout: 60000, waitUntil: "domcontentloaded" });
    } catch (e) {
      console.error("خطا در اتصال به سایت:", e.message);
    }
  }

  console.log("\n==================================================================");
  console.log("✅ مرورگر باز شد!");
  console.log("۱. در صفحه مرورگر وارد حساب کاربری خود شوید (نام کاربری، رمز و کپچا).");
  console.log("۲. صفحه غذاها و منوی هفته را باز کنید.");
  console.log("۳. بعد از پایان کار، کافی است مرورگر را ببندید.");
  console.log("==================================================================\n");

  // Keep running until browser is closed
  await new Promise((resolve) => {
    browser.on("disconnected", resolve);
  });

  // Save summary
  writeFileSync(
    join(CAPTURE_DIR, "summary.json"),
    JSON.stringify(capturedItems, null, 2),
    "utf8"
  );

  console.log("\n🎉 مرورگر بسته شد. تمام درخواست‌ها و اطلاعات در پوشه data/captured ذخیره شدند!");
}

main().catch((err) => {
  console.error("خطای برنامه:", err);
  process.exit(1);
});
