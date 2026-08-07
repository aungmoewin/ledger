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

// TODO Phase 5: the minor-unit exponent is currency-dependent - JPY has 0
// decimal places, not 2 - so this will need the currency once multi-currency
// lands. Deliberately not taking a currency argument until it is honoured.
export function parseAmountToCents(amount: string): number | null {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}
