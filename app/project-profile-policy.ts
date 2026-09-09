export const PROJECT_CONTACT_KEYS = [
  "location",
  "address",
  "phone1",
  "phone2",
  "whatsapp",
  "mapUrl",
  "brochureUrl",
] as const;

export type ProjectContactKey = (typeof PROJECT_CONTACT_KEYS)[number];

export const PROJECT_REQUIRED_CONTACT_KEYS = [
  "location",
  "address",
  "phone1",
] as const satisfies readonly ProjectContactKey[];

export const PROJECT_CONTACT_LABELS: Record<ProjectContactKey, string> = {
  location: "Location",
  address: "Full address",
  phone1: "Primary phone",
  phone2: "Secondary phone (optional)",
  whatsapp: "WhatsApp number",
  mapUrl: "Google Maps link (optional)",
  brochureUrl: "Brochure link (optional)",
};

const contactKeySet = new Set<string>(PROJECT_CONTACT_KEYS);

export type ProjectContactProfile = Record<ProjectContactKey, string>;

export function emptyProjectContactProfile(): ProjectContactProfile {
  return Object.fromEntries(PROJECT_CONTACT_KEYS.map((key) => [key, ""])) as ProjectContactProfile;
}

export function pickProjectContactSettings(
  values: Record<string, string | undefined>,
): ProjectContactProfile {
  const result = emptyProjectContactProfile();
  for (const key of PROJECT_CONTACT_KEYS) result[key] = String(values[key] || "");
  return result;
}

export function missingRequiredProjectContact(
  values: Record<string, string | undefined>,
) {
  return PROJECT_REQUIRED_CONTACT_KEYS.filter((key) => !String(values[key] || "").trim());
}

export function projectMapFallbackUrl(
  values: Record<string, string | undefined>,
) {
  const explicit = String(values.mapUrl || "").trim();
  if (explicit) return explicit;
  const query = String(values.address || values.location || "").trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "";
}

export function withProjectContactFallbacks(
  values: Record<string, string>,
) {
  const next = { ...values };
  if (!next.whatsapp && next.phone1) next.whatsapp = next.phone1;
  if (!next.mapUrl) next.mapUrl = projectMapFallbackUrl(next);
  return next;
}

function validHttpsUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validPhone(value: string) {
  if (!value) return true;
  if (!/^[+0-9().\-\s]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function validateProjectContactPatch(raw: unknown):
  | { ok: true; values: Partial<ProjectContactProfile> }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Contact changes invalid hain" };
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const unknown = entries.find(([key]) => !contactKeySet.has(key));
  if (unknown) {
    return { ok: false, error: `Contact field allowed nahi hai: ${unknown[0]}` };
  }

  const values: Partial<ProjectContactProfile> = {};
  for (const [rawKey, rawValue] of entries) {
    if (typeof rawValue !== "string") {
      return { ok: false, error: `${rawKey} text hona chahiye` };
    }
    const key = rawKey as ProjectContactKey;
    const value = rawValue.trim().replace(/\s+/g, " ");

    if ((key === "location" || key === "address") && value.length > 220) {
      return { ok: false, error: `${PROJECT_CONTACT_LABELS[key]} bahut lamba hai` };
    }
    if (["phone1", "phone2", "whatsapp"].includes(key) && !validPhone(value)) {
      return { ok: false, error: `${PROJECT_CONTACT_LABELS[key]} valid nahi hai` };
    }
    if ((key === "mapUrl" || key === "brochureUrl") && !validHttpsUrl(value)) {
      return { ok: false, error: `${PROJECT_CONTACT_LABELS[key]} me valid https:// link dein` };
    }
    values[key] = value;
  }

  return { ok: true, values };
}
