export function formatCents(
  cents: number,
  currency = "USD",
  locale = "en-US",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

// TODO Phase 5: the minor-unit exponent is currency-dependent - JPY has 0
// decimal places, not 2 - so this will need the currency once multi-currency
// lands. Deliberately not taking a currency argument until it is honoured.
//
// Callers must have matched AMOUNT_PATTERN first, which is why this returns a
// number rather than number | null. Split in two so the guard lives in the Zod
// schema and the exponent lives here - previously the pattern existed in both
// files and only one of them was the real validator.
export function toCents(amount: string): number {
  return Math.round(Number(amount.trim()) * 100);
}
