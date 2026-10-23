// Client for food.aut.ac.ir / samad.aut.ac.ir

import type { DayMenu, UserBalance } from "./types";

export class FoodClient {
  constructor(readonly baseUrl: string = "https://food.aut.ac.ir", private sessionToken: string | null = null) {}

  setSession(token: string) {
    this.sessionToken = token;
  }

  // TODO: Add methods after network analysis
  // - login(user, pass)
  // - getWeeklyMenu()
  // - reserve(mealId)
  // - cancel(mealId)
  // - getBalance()
}
