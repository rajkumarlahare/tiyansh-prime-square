export const CLIENT_EDITABLE_SETTING_KEYS = [
  "location",
  "address",
  "phone1",
  "phone2",
  "whatsapp",
  "mapUrl",
  "brochureUrl",
] as const;

// Client Admin needs a few additional read-only branding values so its own shell
// stays correctly branded. Mapper, CAD, share-builder and publish metadata are
// intentionally excluded from this list.
export const CLIENT_VISIBLE_SETTING_KEYS = [
  "brandName",
  "brandShort",
  "accentColor",
  "logoName",
  "logoVersion",
  ...CLIENT_EDITABLE_SETTING_KEYS,
] as const;

export type ClientEditableSettingKey = (typeof CLIENT_EDITABLE_SETTING_KEYS)[number];

const editableSettingKeys = new Set<string>(CLIENT_EDITABLE_SETTING_KEYS);
const visibleSettingKeys = new Set<string>(CLIENT_VISIBLE_SETTING_KEYS);
const clientPlotStatuses = new Set(["available", "booked", "sold"]);

export function isClientEditableSettingKey(key: string): key is ClientEditableSettingKey {
  return editableSettingKeys.has(key);
}

export function pickClientVisibleSettings(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => visibleSettingKeys.has(key)),
  );
}

export function validClientPlotStatus(value: string) {
  return clientPlotStatuses.has(value);
}
