export type DomainKind = "public" | "admin" | "both";

export function normalizeHost(value: string | null | undefined) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return "";
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return input.replace(/:\d+$/, "").replace(/\.$/, "");
  }
}

export function cleanHostInput(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const host = normalizeHost(raw);
  return host || null;
}

export function validHostname(host: string | null) {
  if (!host || host.length > 253 || !host.includes(".")) return false;
  if (host.includes("*") || host.includes("/") || host.includes(" ")) return false;
  return host.split(".").every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

export function normalizeSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function validSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value);
}

export function platformSlugFromHost(hostValue: string, baseHostValue: string) {
  const host = normalizeHost(hostValue);
  const base = normalizeHost(baseHostValue);
  if (!host || !base || host === base || !host.endsWith(`.${base}`)) return null;
  const prefix = host.slice(0, -(base.length + 1));
  if (!prefix || prefix.includes(".") || !validSlug(prefix)) return null;
  return prefix;
}

export function mergeDomainKind(current: DomainKind, incoming: "public" | "admin"): DomainKind {
  if (current === "both" || current === incoming) return current;
  return "both";
}

export function domainSupports(kind: DomainKind, requested: "public" | "admin") {
  return kind === "both" || kind === requested;
}
