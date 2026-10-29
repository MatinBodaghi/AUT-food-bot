// Builds the `DataId[]` values sent to POST /Reserves/Index.
//
// Taken verbatim from the page's own `btnRegClass` handler:
//
//   id.split('---')[0]
//     + (checked ? "t" : "f")
//     + "fco" + data-count
//     + "pco" + data-precount
//     + "options|" + foodOptionDetails
//     + "|diet:" + (isDietSelected ? "1" : "0")
//
// Observed payloads confirm it:
//   reserve: <base>t fco1 pco0 options||diet:0
//   cancel:  <base>f fco1 pco1 options||diet:0

import type { MealOption } from "./types";

export type ReserveAction = "reserve" | "cancel";

/**
 * Encode one meal option for submission.
 *
 * `result: true` reserves (checkbox becomes checked), `false` cancels. The count
 * is 1 for a single toggle — the page writes `data-count = 1` on change — while
 * `pco` keeps the count the page reported before the change.
 */
export function buildDataId(option: MealOption, action: ReserveAction): string {
  const base = option.dataId.split("---")[0];
  const checked = action === "reserve" ? "t" : "f";
  const preCount = action === "cancel" ? Math.max(option.preCount, 1) : option.preCount;
  return `${base}${checked}fco1pco${preCount}options||diet:0`;
}
