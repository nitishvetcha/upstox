// Display text for a source or freshness value. Only END_OF_DAY changes text; every other value is shown exactly as before.
// END_OF_DAY is a closed-session quote, not a live one and not a stale one, so it gets its own label.
export function freshnessDisplayLabel(value: string | null | undefined): string {
  if (value === "END_OF_DAY") return "END OF DAY";
  // Unchanged for every other value, including null (previously rendered by a template literal as "null").
  return `${value}`;
}
