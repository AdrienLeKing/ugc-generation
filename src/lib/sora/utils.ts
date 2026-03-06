export function nowIsoString() {
  return new Date().toISOString();
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function toIsoTimestamp(value: number | string | undefined) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const fromString = new Date(value);
    return Number.isNaN(fromString.getTime()) ? undefined : fromString.toISOString();
  }

  const asMilliseconds = value > 1_000_000_000_000 ? value : value * 1_000;
  const fromNumber = new Date(asMilliseconds);
  return Number.isNaN(fromNumber.getTime()) ? undefined : fromNumber.toISOString();
}
