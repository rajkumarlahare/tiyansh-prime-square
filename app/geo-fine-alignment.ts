import type { GeoPoint } from "./geo-model";

export type GeoFineAlignment = {
  eastMeters: number;
  northMeters: number;
  rotationDeg: number;
  scale: number;
};

export const ZERO_GEO_FINE_ALIGNMENT: GeoFineAlignment = {
  eastMeters: 0,
  northMeters: 0,
  rotationDeg: 0,
  scale: 1,
};

const EARTH_RADIUS_METERS = 6378137;
const MAX_TRANSLATION_METERS = 5000;
const MAX_ROTATION_DEGREES = 180;
const MIN_UNIFORM_SCALE = 0.5;
const MAX_UNIFORM_SCALE = 1.5;

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function numericField(value: unknown, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeGeoFineAlignment(raw: unknown): GeoFineAlignment {
  const item =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const eastMeters = round(numericField(item.eastMeters), 4);
  const northMeters = round(numericField(item.northMeters), 4);
  const rotationDeg = round(numericField(item.rotationDeg), 6);
  const scale = round(numericField(item.scale, 1), 6);

  if (Math.abs(eastMeters) > MAX_TRANSLATION_METERS)
    throw new Error(`Fine Align east offset ±${MAX_TRANSLATION_METERS} m ke andar rakhein`);
  if (Math.abs(northMeters) > MAX_TRANSLATION_METERS)
    throw new Error(`Fine Align north offset ±${MAX_TRANSLATION_METERS} m ke andar rakhein`);
  if (Math.abs(rotationDeg) > MAX_ROTATION_DEGREES)
    throw new Error(`Fine Align rotation ±${MAX_ROTATION_DEGREES}° ke andar rakhein`);
  if (scale < MIN_UNIFORM_SCALE || scale > MAX_UNIFORM_SCALE)
    throw new Error(
      `Fine Align scale ${MIN_UNIFORM_SCALE * 100}% se ${MAX_UNIFORM_SCALE * 100}% ke andar rakhein`,
    );

  return { eastMeters, northMeters, rotationDeg, scale };
}

export function sameGeoFineAlignment(a: unknown, b: unknown) {
  const left = normalizeGeoFineAlignment(a);
  const right = normalizeGeoFineAlignment(b);
  return (
    left.eastMeters === right.eastMeters &&
    left.northMeters === right.northMeters &&
    left.rotationDeg === right.rotationDeg &&
    left.scale === right.scale
  );
}

export function geoAlignmentAnchor(calibration: {
  minLng: number;
  minLat: number;
  lngSpan: number;
  latSpan: number;
}): GeoPoint {
  return [
    calibration.minLng + calibration.lngSpan / 2,
    calibration.minLat + calibration.latSpan / 2,
  ];
}

export function applyGeoFineAlignment(
  point: GeoPoint,
  anchor: GeoPoint,
  rawAlignment: unknown,
): GeoPoint {
  const alignment = normalizeGeoFineAlignment(rawAlignment);
  if (
    alignment.eastMeters === 0 &&
    alignment.northMeters === 0 &&
    alignment.rotationDeg === 0 &&
    alignment.scale === 1
  )
    return [point[0], point[1]];

  const radians = Math.PI / 180;
  const anchorLatRad = anchor[1] * radians;
  const longitudeScale = Math.max(1e-7, Math.cos(anchorLatRad));
  const x =
    (point[0] - anchor[0]) * radians * EARTH_RADIUS_METERS * longitudeScale;
  const y = (point[1] - anchor[1]) * radians * EARTH_RADIUS_METERS;
  const theta = alignment.rotationDeg * radians;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const scaledX = x * alignment.scale;
  const scaledY = y * alignment.scale;
  const rotatedX = scaledX * cos - scaledY * sin + alignment.eastMeters;
  const rotatedY = scaledX * sin + scaledY * cos + alignment.northMeters;

  return [
    anchor[0] +
      (rotatedX / (EARTH_RADIUS_METERS * longitudeScale)) / radians,
    anchor[1] + (rotatedY / EARTH_RADIUS_METERS) / radians,
  ];
}

export function geoGenerationFingerprint(
  points: Array<{
    id: string;
    source: [number, number];
    target: [number, number];
  }>,
  rawAlignment: unknown,
) {
  const alignment = normalizeGeoFineAlignment(rawAlignment);
  const text = JSON.stringify({
    points: points.map((point) => [
      point.id,
      Number(point.source[0]),
      Number(point.source[1]),
      Number(point.target[0]),
      Number(point.target[1]),
    ]),
    fineAlignment: [
      alignment.eastMeters,
      alignment.northMeters,
      alignment.rotationDeg,
      alignment.scale,
    ],
  });
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
