export function fmt(value: number | undefined, digits = 4) {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

export function formatArgs(args: unknown[]) {
  if (!args.length) return "[]";
  return `[${args
    .map((value) => (typeof value === "number" ? value.toFixed(5) : String(value)))
    .join(", ")}]`;
}
