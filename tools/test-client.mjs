import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FoodClient } from "../src/food/client.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEV_VARS = join(ROOT, ".dev.vars");

if (!existsSync(DEV_VARS)) {
  console.error("❌ فایل .dev.vars پیدا نشد!");
  process.exit(1);
}

const vars = Object.fromEntries(
  readFileSync(DEV_VARS, "utf8")
    .split(/\r?\n/)
    .map((line) => line.split("="))
    .filter(([k]) => k && !k.startsWith("#"))
    .map(([k, ...v]) => [k.trim(), v.join("=").trim()])
);

const username = vars.AUT_USERNAME;
const password = vars.AUT_PASSWORD;

if (!username || !password) {
  console.error("❌ مقادیر AUT_USERNAME یا AUT_PASSWORD در .dev.vars تنظیم نشده‌اند.");
  process.exit(1);
}

console.log("=================================================");
console.log(`🔐 تست اتصال و ورود برای کاربر: ${username} ...`);
console.log("=================================================");

async function test() {
  const client = new FoodClient();
  const start = Date.now();

  console.log("⏳ ۱. در حال ارسال درخواست ورود به CAS و سامانه تغذیه...");
  await client.login(username, password);
  console.log(`✅ ورود با موفقیت انجام شد! (زمان: ${Date.now() - start} میلی‌ثانیه)`);

  console.log("\n⏳ ۲. در حال دریافت لیست سلف‌ها و رستوران‌های مجاز کاربر...");
  const personGroupId = await client.getPersonGroupId();
  console.log(`✅ شناسهٔ گروه کاربر: ${personGroupId}`);
  const restaurants = await client.getRestaurants(personGroupId);
  console.log(`✅ ${restaurants.length} سلف/رستوران مجاز دریافت شد:`);
  restaurants.forEach((r) => {
    console.log(`   [ID: ${r.id}] ${r.name}`);
  });

  console.log("\n⏳ ۳. در حال دریافت جدول رزرو هفته جاری برای سلف اول...");
  const firstRest = restaurants[0]?.id ?? 1;
  const html = await client.getReservePage(personGroupId, firstRest);
  console.log(`✅ جدول رزرو هفته با موفقیت دریافت شد! (حجم HTML: ${html.length} بایت)`);

  // Save the full HTML for analysis
  mkdirSync(join(ROOT, "data", "captured"), { recursive: true });
  writeFileSync(join(ROOT, "data", "captured", "full_reserve_page.html"), html, "utf8");
  console.log("💾 متن کامل جدول برای تحلیل در data/captured/full_reserve_page.html ذخیره شد.");

  console.log("\n🎉 تست موفقیت‌آمیز بود! کلاینت کاملاً کار می‌کند.");
}

test().catch((err) => {
  console.error("\n❌ خطا در تست:", err.message);
  process.exit(1);
});
