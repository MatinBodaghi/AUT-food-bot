// HTML parsing for the server-rendered reserve page returned by
// POST /Reserves/GetReservePage. The markup has two views: `.PhoneView` (one
// block per day) and `.DesktopView` (a grid). Both are in the payload, so only
// one of them may be parsed or every meal appears twice.

import { parse, type HTMLElement } from "node-html-parser";

import type { DayMenu, Meal, MealOption, MealType, ReservePage } from "./types";

const MEAL_TYPES: Record<string, MealType> = {
  "ناهار": "lunch",
  "شام": "dinner",
  "صبحانه": "breakfast",
};

/** Convert Persian/Arabic digits to Latin ones. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

/** First number in a display string: "1,000,000-" → -1000000, "۳۵۰٬۰۰۰" → 350000. */
export function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const latin = toLatinDigits(value).trim().replace(/[,\u066C\s]/g, "");
  const match = /-?\d+(?:\.\d+)?/.exec(latin);
  if (!match) return null;
  // The page writes debt as a trailing minus ("1,000,000-"), not a leading one.
  const negative = latin.endsWith("-") || match[0].startsWith("-");
  const parsed = Number(match[0].replace("-", ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function className(element: HTMLElement): string {
  return element.getAttribute("class") ?? "";
}

function mealTypeOf(text: string | undefined): MealType | null {
  const label = text?.trim();
  return label ? (MEAL_TYPES[label] ?? null) : null;
}

function parseOption(block: HTMLElement): MealOption | null {
  const input = block.querySelector("input.reserveFoodCheckBox");
  if (!input) return null;

  const label = block.querySelector("label.reserveFoodCheckBox");
  const priceElement = block.querySelector(".reserveFoodType");
  const priceText = priceElement?.text.trim() ?? "";
  const price = parseNumber(priceText);

  // The label text includes the price span, so drop everything from that span on.
  const name = (label?.innerHTML.split(/<span[^>]*reserveFoodType/i)[0] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    dataId: input.getAttribute("id") ?? "",
    name,
    price,
    reserved: input.getAttribute("data-prechecked") === "True",
    selectable: !input.hasAttribute("disabled"),
    options: input.getAttribute("data-food-options") ?? "",
    dietFood: input.getAttribute("data-diet-food") ?? "",
  };
}

/** Meals of a single day live in a flex container after its `.dayContainer`. */
function parseMeals(container: HTMLElement): Meal[] {
  const meals: Meal[] = [];
  let current: MealType | null = null;

  for (const node of container.childNodes) {
    if (node.nodeType !== 1) continue;
    const element = node as HTMLElement;
    const classes = className(element);

    if (classes.includes("reserveFoodMeal")) {
      current = mealTypeOf(element.querySelector(".TimeMeal")?.text);
      continue;
    }

    const blocks = element.querySelectorAll(".foodMainCnt");
    if (blocks.length === 0) continue;

    const options = blocks
      .map(parseOption)
      .filter((option): option is MealOption => option !== null);
    if (options.length === 0) continue;

    meals.push({ type: current ?? "lunch", options });
  }

  return meals;
}

function parsePhoneView(view: HTMLElement): DayMenu[] {
  const days: DayMenu[] = [];

  for (const dayElement of view.querySelectorAll(".dayContainer")) {
    const dayName = dayElement.querySelector(".day")?.text.trim();
    const date = dayElement.querySelector(".date")?.text.trim();
    const container = dayElement.nextElementSibling as HTMLElement | null;
    if (!dayName || !date || !container) continue;
    days.push({ dayName, date, meals: parseMeals(container) });
  }

  return days;
}

/** The desktop grid has no day blocks: each column carries a `#DateDiv` ("شنبه-1405/08/02"). */
function parseDesktopView(view: HTMLElement): DayMenu[] {
  const byDate = new Map<string, DayMenu>();

  for (const column of view.querySelectorAll(".WeekMeal")) {
    const header = column.querySelector("#DateDiv")?.text.trim();
    if (!header) continue;

    const separator = header.lastIndexOf("-");
    const dayName = separator === -1 ? header : header.slice(0, separator).trim();
    const date = separator === -1 ? "" : header.slice(separator + 1).trim();
    if (!date) continue;

    const options = column
      .querySelectorAll(".foodMainCnt")
      .map(parseOption)
      .filter((option): option is MealOption => option !== null);
    if (options.length === 0) continue;

    const existing = byDate.get(date);
    if (existing) {
      existing.meals.push({ type: "lunch", options });
    } else {
      byDate.set(date, { dayName, date, meals: [{ type: "lunch", options }] });
    }
  }

  return [...byDate.values()];
}

export function parseReservePage(html: string): ReservePage {
  const root = parse(html);
  const credit = parseNumber(root.querySelector("#reserveCredit")?.text);
  // The header is rendered as "رستوران :  <name>", sometimes with stray spaces.
  const rawRestaurant = root.querySelector(".restTXT span")?.text.trim() ?? "";
  const restaurant = rawRestaurant.replace(/^رستوران\s*:\s*/, "").trim() || null;

  const phone = root.querySelector(".PhoneView");
  const desktop = root.querySelector(".DesktopView");

  let days: DayMenu[] = phone ? parsePhoneView(phone) : [];
  if (days.length === 0 && desktop) days = parseDesktopView(desktop);

  return { restaurant, credit, days };
}
