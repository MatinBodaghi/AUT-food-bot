import { describe, expect, it } from "vitest";

import { parseNumber, parseReservePage, toLatinDigits } from "../src/food/parse";
import html from "./fixtures/menu.html?raw";

describe("parseNumber", () => {
  it("parses plain and grouped Latin numbers", () => {
    expect(parseNumber("350,000")).toBe(350_000);
    expect(parseNumber(" 250 ")).toBe(250);
  });

  it("treats a trailing minus as a negative balance", () => {
    expect(parseNumber("1,000,000-")).toBe(-1_000_000);
    expect(parseNumber("-1,000,000")).toBe(-1_000_000);
  });

  it("converts Persian digits and separators", () => {
    expect(toLatinDigits("۱۲۳۴")).toBe("1234");
    expect(parseNumber("۳۵۰٬۰۰۰")).toBe(350_000);
  });

  it("returns null when there is no number", () => {
    expect(parseNumber("—")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
});

describe("parseReservePage", () => {
  const page = parseReservePage(html);

  it("reads the credit and the restaurant name", () => {
    expect(page.credit).toBe(-1_000_000);
    expect(page.restaurant).toBe("سلف برادران دانشگاه");
  });

  it("uses only the phone view, so meals are not duplicated", () => {
    expect(page.days).toHaveLength(2);
    expect(page.days[0]?.dayName).toBe("شنبه");
    expect(page.days[0]?.date).toBe("1405/08/02");
  });

  it("groups food options under the day's meal", () => {
    const meals = page.days[0]?.meals ?? [];
    expect(meals).toHaveLength(1);
    expect(meals[0]?.type).toBe("lunch");
    expect(meals[0]?.options).toHaveLength(2);
  });

  it("keeps the data id, name, price and reservation state of each option", () => {
    const [first, second] = page.days[0]?.meals[0]?.options ?? [];
    expect(first).toMatchObject({
      name: "چلوخورش قیمه سیب زمینی +ماست",
      price: 350_000,
      reserved: true,
      selectable: false,
    });
    expect(first?.dataId).toContain("rr1516590");
    expect(second).toMatchObject({
      name: "کوردون بلو+ نوشابه",
      price: 250_000,
      reserved: false,
    });
  });
});
