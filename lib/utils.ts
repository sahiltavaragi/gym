export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(n: number | null | undefined) {
  if (n == null) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function monthLabel(d: string | Date) {
  return new Date(d).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function monthKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
