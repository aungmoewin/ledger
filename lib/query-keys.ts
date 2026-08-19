export const expenseKeys = {
  all: ["expenses"] as const,
  // householdId is in the key even though the client never sends it - the route
  // handler derives it from the session. It belongs here so that switching
  // household (P2.9) cannot serve one household's cache to another.
  list: (householdId: number) => ["expenses", "list", householdId] as const,
};
