export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatNumber(value: number | string, options?: Intl.NumberFormatOptions): string {
  if (typeof value === "number") {
    return value.toLocaleString("pt-BR", options);
  }
  return value;
}