import {
  applyHomography,
  solveHomography,
  type HomographyPair,
  type MapperPoint,
} from "./mapper-geometry";
import type { GeoPoint } from "./geo-model";

export type GeoControlPoint = {
  id: string;
  source: MapperPoint;
  target: GeoPoint;
  label?: string;
};

export type GeoCalibration = {
  matrix: number[];
  minLng: number;
  minLat: number;
  lngSpan: number;
  latSpan: number;
};

function bounds(points: GeoPoint[]) {
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return { minLng, minLat, lngSpan: maxLng - minLng, latSpan: maxLat - minLat };
}

export function solveGeoCalibration(points: GeoControlPoint[]): GeoCalibration {
  if (points.length < 4) throw new Error("Geo calibration ke liye kam se kam 4 control points chahiye");
  if (points.length > 12) throw new Error("Geo calibration me adhiktam 12 control points rakhein");

  const targetBounds = bounds(points.map((point) => point.target));
  if (targetBounds.lngSpan < 1e-8 || targetBounds.latSpan < 1e-8)
    throw new Error("Control points geographic area ko 2 dimensions me cover karne chahiye");

  const pairs: HomographyPair[] = points.map((point) => ({
    source: point.source,
    target: [
      (point.target[0] - targetBounds.minLng) / targetBounds.lngSpan,
      (point.target[1] - targetBounds.minLat) / targetBounds.latSpan,
    ],
  }));

  return { matrix: solveHomography(pairs), ...targetBounds };
}

export function mapNormalizedPointToGeo(
  calibration: GeoCalibration,
  source: MapperPoint,
): GeoPoint {
  const mapped = applyHomography(calibration.matrix, source);
  const lng = calibration.minLng + mapped[0] * calibration.lngSpan;
  const lat = calibration.minLat + mapped[1] * calibration.latSpan;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90)
    throw new Error("Calibration se invalid geographic point bana");
  return [lng, lat];
}

export function mapNormalizedPolygonToGeo(
  calibration: GeoCalibration,
  polygon: MapperPoint[],
): GeoPoint[] {
  if (polygon.length < 3) throw new Error("Plot polygon invalid hai");
  const points = polygon.map((point) => mapNormalizedPointToGeo(calibration, point));
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first] as GeoPoint);
  return points;
}

function haversineMeters(a: GeoPoint, b: GeoPoint) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const lat1 = a[1] * rad;
  const lat2 = b[1] * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function geoCalibrationErrorMeters(
  calibration: GeoCalibration,
  points: GeoControlPoint[],
) {
  if (!points.length) return 0;
  return (
    points.reduce(
      (sum, point) => sum + haversineMeters(mapNormalizedPointToGeo(calibration, point.source), point.target),
      0,
    ) / points.length
  );
}
