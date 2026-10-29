import { describe, expect, it } from "vitest";

import { btn, esc, fa, fmtTime, kb, truncate } from "../src/telegram/format";

describe("Persian formatting helpers", () => {
  it("converts Latin digits to Persian digits", () => {
    expect(fa(1234567890)).toBe("۱۲۳۴۵۶۷۸۹۰");
  });

  it("escapes HTML special characters", () => {
    expect(esc("<b>food & drink</b>")).toBe("&lt;b&gt;food &amp; drink&lt;/b&gt;");
  });

  it("truncates long messages and appends an ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abcd\n…");
    expect(truncate("abc", 4)).toBe("abc");
  });

  it("renders empty timestamps as a dash", () => {
    expect(fmtTime(null)).toBe("—");
    expect(fmtTime(undefined)).toBe("—");
    expect(fmtTime(0)).toBe("—");
  });

  it("builds an inline keyboard and drops empty rows", () => {
    expect(kb([[btn("منو", "menu")], false, null])).toEqual({
      inline_keyboard: [[{ text: "منو", callback_data: "menu" }]],
    });
  });
});
