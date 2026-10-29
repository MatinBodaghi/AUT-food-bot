// Types for food.aut.ac.ir / samad.aut.ac.ir

export interface Restaurant {
  id: number;
  name: string;
}

export type MealType = "lunch" | "dinner" | "breakfast";

/** One food option inside a meal column of the reserve page. */
export interface MealOption {
  /** The encoded checkbox id; the server expects it when reserving. */
  dataId: string;
  name: string;
  /** Price in rials, if the page shows one. */
  price: number | null;
  /** Already reserved before this page load (`data-prechecked`). */
  reserved: boolean;
  /** The page allows interacting with this option (no `disabled` attribute). */
  selectable: boolean;
  /** Optional food options payload (`data-food-options`). */
  options: string;
  dietFood: string;
  /** `data-precount`: how many were reserved before this page load. */
  preCount: number;
  /** `data-count`: the count the page currently submits (0 until toggled). */
  count: number;
}

export interface Meal {
  type: MealType;
  options: MealOption[];
}

export interface DayMenu {
  /** Persian weekday name, e.g. "شنبه". */
  dayName: string;
  /** Jalali date in YYYY/MM/DD, e.g. "1405/08/02". */
  date: string;
  meals: Meal[];
}

export interface ReservePage {
  restaurant: string | null;
  /** Credit in rials; negative when the account is in debt. */
  credit: number | null;
  days: DayMenu[];
}

export interface UserBalance {
  currentBalance: number;
  name?: string;
  studentId?: string;
}
