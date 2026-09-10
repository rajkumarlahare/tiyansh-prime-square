export type GeoPoint = [number, number]; // [longitude, latitude]

export type GeoGeometry =
  | { type: "Point"; coordinates: GeoPoint }
  | { type: "LineString"; coordinates: GeoPoint[] }
  | { type: "Polygon"; coordinates: GeoPoint[][] };

export type GeoFeatureInput = {
  id?: string;
  name?: string;
  layer?: string;
  geometry: GeoGeometry;
  linkedPlotId?: string | null;
  source?: string;
  properties?: Record<string, unknown>;
};

export type GeoFeatureRecord = {
  id: string;
  projectId: string;
  name: string;
  layer: string;
  geometryType: GeoGeometry["type"];
  geometry: GeoGeometry;
  linkedPlotId: string | null;
  source: string;
  properties: Record<string, unknown>;
  updatedAt: string;
};

const MAX_COORDINATES = 5000;
const MAX_PROPERTIES_JSON = 12_000;

export function cleanGeoFeatureId(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function validLngLat(point: unknown): point is GeoPoint {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1])) &&
    Number(point[0]) >= -180 &&
    Number(point[0]) <= 180 &&
    Number(point[1]) >= -90 &&
    Number(point[1]) <= 90
  );
}

function samePoint(a: GeoPoint, b: GeoPoint) {
  return Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
}

function normalizedPoint(value: unknown): GeoPoint {
  if (!validLngLat(value)) throw new Error("Longitude/latitude invalid hai");
  return [Number(value[0]), Number(value[1])];
}

export function normalizeGeoGeometry(raw: unknown): GeoGeometry {
  if (!raw || typeof raw !== "object") throw new Error("Geo geometry missing hai");
  const geometry = raw as { type?: unknown; coordinates?: unknown };
  const type = String(geometry.type || "");

  if (type === "Point") {
    return { type: "Point", coordinates: normalizedPoint(geometry.coordinates) };
  }

  if (type === "LineString") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2)
      throw new Error("LineString me kam se kam 2 points chahiye");
    if (geometry.coordinates.length > MAX_COORDINATES)
      throw new Error("LineString bahut bada hai");
    return {
      type: "LineString",
      coordinates: geometry.coordinates.map(normalizedPoint),
    };
  }

  if (type === "Polygon") {
    if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length)
      throw new Error("Polygon coordinates missing hain");
    const rings = geometry.coordinates as unknown[];
    let count = 0;
    const normalized = rings.map((rawRing) => {
      if (!Array.isArray(rawRing) || rawRing.length < 3)
        throw new Error("Polygon ring me kam se kam 3 points chahiye");
      count += rawRing.length;
      if (count > MAX_COORDINATES) throw new Error("Polygon bahut bada hai");
      const ring = rawRing.map(normalizedPoint);
      if (!samePoint(ring[0], ring[ring.length - 1])) ring.push([...ring[0]] as GeoPoint);
      if (ring.length < 4) throw new Error("Polygon ring invalid hai");
      return ring;
    });
    return { type: "Polygon", coordinates: normalized };
  }

  throw new Error("Sirf Point, LineString aur Polygon supported hain");
}

export function normalizeGeoFeature(raw: unknown): GeoFeatureInput {
  if (!raw || typeof raw !== "object") throw new Error("Geo feature invalid hai");
  const item = raw as Record<string, unknown>;
  const geometry = normalizeGeoGeometry(item.geometry);
  const id = cleanGeoFeatureId(String(item.id || ""));
  const name = String(item.name || "").trim().slice(0, 160);
  const layer = String(item.layer || "default").trim().slice(0, 80) || "default";
  const linkedPlotId = String(item.linkedPlotId || "").trim().slice(0, 80) || null;
  const source = String(item.source || "manual").trim().slice(0, 80) || "manual";
  const properties =
    item.properties && typeof item.properties === "object" && !Array.isArray(item.properties)
      ? (item.properties as Record<string, unknown>)
      : {};
  const propertiesJson = JSON.stringify(properties);
  if (propertiesJson.length > MAX_PROPERTIES_JSON)
    throw new Error("Feature properties bahut badi hain");
  return { id, name, layer, geometry, linkedPlotId, source, properties };
}

export function geoGeometryBounds(geometry: GeoGeometry) {
  const points: GeoPoint[] =
    geometry.type === "Point"
      ? [geometry.coordinates]
      : geometry.type === "LineString"
        ? geometry.coordinates
        : geometry.coordinates.flat();
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return {
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats),
  };
}

export function featureRowToRecord(row: {
  id: string;
  projectId: string;
  name: string;
  layer: string;
  geometryType: string;
  geometry: string;
  linkedPlotId: string | null;
  source: string;
  properties: string;
  updatedAt: string;
}): GeoFeatureRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    layer: row.layer,
    geometryType: row.geometryType as GeoGeometry["type"],
    geometry: normalizeGeoGeometry(JSON.parse(row.geometry)),
    linkedPlotId: row.linkedPlotId,
    source: row.source,
    properties: JSON.parse(row.properties || "{}") as Record<string, unknown>,
    updatedAt: row.updatedAt,
  };
}

export function featuresToFeatureCollection(features: GeoFeatureRecord[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      id: feature.id,
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        name: feature.name,
        layer: feature.layer,
        linkedPlotId: feature.linkedPlotId,
        source: feature.source,
      },
    })),
  };
}
