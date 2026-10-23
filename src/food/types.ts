// Types for food.aut.ac.ir / samad.aut.ac.ir

export interface Meal {
  id: number | string;
  name: string;
  price?: number;
  date: string; // YYYY-MM-DD
  mealType: "lunch" | "dinner" | "breakfast";
  restaurant?: string;
  reserved?: boolean;
}

export interface DayMenu {
  date: string;
  dayName: string;
  meals: Meal[];
}

export interface UserBalance {
  currentBalance: number;
  name?: string;
  studentId?: string;
}
