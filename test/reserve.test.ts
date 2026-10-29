import { describe, expect, it } from "vitest";

import { buildDataId } from "../src/food/reserve";
import type { MealOption } from "../src/food/types";

const base: MealOption = {
  dataId: "rr1516575fp1dd2026_10_28ppp00-00dt2026_10_28ppp00-00me5dm5fo199rest1---9428d4b5",
  name: "چلوخورش قیمه",
  price: 350_000,
  reserved: false,
  selectable: true,
  options: "",
  dietFood: "dietfood---9428d4b5",
  preCount: 0,
  count: 0,
};

describe("buildDataId", () => {
  it("reserves with a checked flag and the old pre-count", () => {
    // Matches the live capture: ...rest1t fco1 pco0 options||diet:0
    expect(buildDataId(base, "reserve")).toBe(
      "rr1516575fp1dd2026_10_28ppp00-00dt2026_10_28ppp00-00me5dm5fo199rest1tfco1pco0options||diet:0",
    );
  });

  it("cancels with an unchecked flag and a pre-count of at least one", () => {
    const reserved = { ...base, reserved: true, preCount: 1 };
    // Matches the live capture: ...rest1f fco1 pco1 options||diet:0
    expect(buildDataId(reserved, "cancel")).toBe(base.dataId.split("---")[0] + "ffco1pco1options||diet:0");
  });

  it("drops the uuid part of the checkbox id", () => {
    expect(buildDataId(base, "reserve")).not.toContain("---");
  });
});
