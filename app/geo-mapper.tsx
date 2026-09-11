"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  MapPinned,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import type { GeoGeometry } from "./geo-model";
import GeoVisualCalibration from "./geo-visual-calibration";
import GeoVisualCalibrationGuard from "./geo-visual-calibration-guard";
import styles from "./geo-mapper.module.css";

type ControlPoint = {
  id: string;
  source: [number, number];
  target: [number, number];
  sourceSet?: boolean;
  label?: string;
};

type GeoFeature = {
  id: string;
  name: string;
  layer: string;
  geometryType: "Point" | "LineString" | "Polygon";
  geometry: GeoGeometry;
  linkedPlotId: string | null;
  source: string;
  properties: Record<string, unknown>;
};

type CalibrationPointDiagnostic = {
  id: string;
  label: string;
  fitErrorMeters: number;
  validationErrorMeters: number | null;
};

type CalibrationDiagnostics = {
  pointCount: number;
  validationCoverage: number;
  fitMeanErrorMeters: number;
  fitRmsErrorMeters: number;
  fitMaxErrorMeters: number;
  validationMeanErrorMeters: number | null;
  validationRmsErrorMeters: number | null;
  validationMaxErrorMeters: number | null;
  worstPointId: string | null;
  points: CalibrationPointDiagnostic[];
};

type GeoState = {
  schemaVersion: number;
  projectId: string;
  features: GeoFeature[];
  controlPoints: ControlPoint[];
  plots: { id: string; status: string }[];
  sources: {
    id: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    createdAt: string;
  }[];
  calibrationErrorMeters: number | null;
  calibrationDiagnostics: CalibrationDiagnostics | null;
  publish: {
    draftRevision: number;
    publishedRevision: number;
    publicEnabled: boolean;
    publishedAt: string | null;
    dirty: boolean;
  };
};

type ImportFeature = {
  id?: string;
  name?: string;
  layer?: string;
  geometry: unknown;
  linkedPlotId?: string | null;
  source?: string;
  properties?: Record<string, unknown>;
};

const emptyState = (projectId: string): GeoState => ({
  schemaVersion: 1,
  projectId,
  features: [],
  controlPoints: [],
  plots: [],
  sources: [],
  calibrationErrorMeters: null,
  calibrationDiagnostics: null,
  publish: {
    draftRevision: 0,
    publishedRevision: 0,
    publicEnabled: false,
    publishedAt: null,
    dirty: false,
  },
});

function controlPointsSignature(points: ControlPoint[]) {
  return JSON.stringify(
    points.map((point) => [
      point.id,
      Number(point.source[0]),
      Number(point.source[1]),
      Number(point.target[0]),
      Number(point.target[1]),
      String(point.label || ""),
    ]),
  );
}

function controlPointsFingerprint(points: ControlPoint[]) {
  const text = JSON.stringify(
    points.map((point) => [
      point.id,
      Number(point.source[0]),
      Number(point.source[1]),
      Number(point.target[0]),
      Number(point.target[1]),
    ]),
  );
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function importIdPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "source";
}

function stableImportId(filename: string, featureIndex: number, pieceIndex = 0) {
  return `import:${importIdPart(filename)}:${featureIndex + 1}${pieceIndex ? `:${pieceIndex + 1}` : ""}`;
}

function parseCoordinateText(type: "Point" | "LineString" | "Polygon", raw: string): GeoGeometry {
  const points = raw
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [lng, lat] = line.split(/[\s,]+/).map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat))
        throw new Error(`Coordinate invalid: ${line}`);
      return [lng, lat] as [number, number];
    });
  if (type === "Point") {
    if (points.length !== 1) throw new Error("Point ke liye ek longitude,latitude line dein");
    return { type, coordinates: points[0] };
  }
  if (type === "LineString") {
    if (points.length < 2) throw new Error("Line ke liye kam se kam 2 coordinates dein");
    return { type, coordinates: points };
  }
  if (points.length < 3) throw new Error("Polygon ke liye kam se kam 3 coordinates dein");
  return { type, coordinates: [points] };
}

function geometryPieces(geometry: Record<string, unknown>) {
  const type = String(geometry.type || "");
  const coordinates = geometry.coordinates;
  if (["Point", "LineString", "Polygon"].includes(type))
    return [{ type, coordinates }];
  if (type === "MultiPoint" && Array.isArray(coordinates))
    return coordinates.map((point) => ({ type: "Point", coordinates: point }));
  if (type === "MultiLineString" && Array.isArray(coordinates))
    return coordinates.map((line) => ({ type: "LineString", coordinates: line }));
  if (type === "MultiPolygon" && Array.isArray(coordinates))
    return coordinates.map((polygon) => ({ type: "Polygon", coordinates: polygon }));
  return [];
}

function parseGeoJson(text: string, filename: string): ImportFeature[] {
  const json = JSON.parse(text) as Record<string, unknown>;
  const rawFeatures =
    json.type === "FeatureCollection" && Array.isArray(json.features)
      ? json.features
      : json.type === "Feature"
        ? [json]
        : [{ type: "Feature", geometry: json, properties: {} }];
  const output: ImportFeature[] = [];
  rawFeatures.forEach((raw, featureIndex) => {
    if (!raw || typeof raw !== "object") return;
    const feature = raw as Record<string, unknown>;
    const geometry = feature.geometry as Record<string, unknown> | null;
    if (!geometry) return;
    const properties =
      feature.properties && typeof feature.properties === "object" && !Array.isArray(feature.properties)
        ? (feature.properties as Record<string, unknown>)
        : {};
    const pieces = geometryPieces(geometry);
    pieces.forEach((piece, pieceIndex) => {
      const baseId = String(feature.id || properties.id || "").trim();
      output.push({
        id: baseId
          ? `${baseId}${pieces.length > 1 ? `-${pieceIndex + 1}` : ""}`
          : stableImportId(filename, featureIndex, pieceIndex),
        name: String(properties.name || properties.Name || `Imported ${featureIndex + 1}`),
        layer: String(properties.layer || properties.Layer || filename.replace(/\.[^.]+$/, "") || "imported"),
        geometry: piece,
        linkedPlotId: properties.linkedPlotId ? String(properties.linkedPlotId) : null,
        source: "geojson",
        properties,
      });
    });
  });
  return output;
}

function xmlElements(root: Document | Element, localName: string) {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function parseKmlCoordinates(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .map((part) => part.split(",").slice(0, 2).map(Number))
    .filter((point) => point.length === 2 && point.every(Number.isFinite));
}

function parseKml(text: string, filename: string): ImportFeature[] {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xmlElements(xml, "parsererror").length) throw new Error("KML parse nahi hui");
  const output: ImportFeature[] = [];
  xmlElements(xml, "Placemark").forEach((placemark, index) => {
    const name = xmlElements(placemark, "name")[0]?.textContent?.trim() || `Placemark ${index + 1}`;
    const layer = filename.replace(/\.[^.]+$/, "") || "kml";
    const id = stableImportId(filename, index);
    const point = xmlElements(placemark, "Point")[0];
    const line = xmlElements(placemark, "LineString")[0];
    const polygon = xmlElements(placemark, "Polygon")[0];
    if (point) {
      const coords = parseKmlCoordinates(xmlElements(point, "coordinates")[0]?.textContent || "");
      if (coords[0]) output.push({ id, name, layer, geometry: { type: "Point", coordinates: coords[0] }, source: "kml" });
    } else if (line) {
      const coords = parseKmlCoordinates(xmlElements(line, "coordinates")[0]?.textContent || "");
      if (coords.length >= 2)
        output.push({ id, name, layer, geometry: { type: "LineString", coordinates: coords }, source: "kml" });
    } else if (polygon) {
      const rings = xmlElements(polygon, "LinearRing")
        .map((ring) => parseKmlCoordinates(xmlElements(ring, "coordinates")[0]?.textContent || ""))
        .filter((ring) => ring.length >= 3);
      if (rings.length)
        output.push({ id, name, layer, geometry: { type: "Polygon", coordinates: rings }, source: "kml" });
    }
  });
  return output;
}

function importedFeatures(file: File, text: string) {
  return file.name.toLowerCase().endsWith(".kml")
    ? parseKml(text, file.name)
    : parseGeoJson(text, file.name);
}

function featurePoints(feature: GeoFeature) {
  const geometry = feature.geometry;
  return geometry.type === "Point"
    ? [geometry.coordinates]
    : geometry.type === "LineString"
      ? geometry.coordinates
      : geometry.coordinates.flat();
}

export default function GeoMapper({
  projectId,
  notify,
}: {
  projectId: string;
  notify: (message: string) => void;
}) {
  const [state, setState] = useState<GeoState>(() => emptyState(projectId));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
  const [manualType, setManualType] = useState<"Point" | "LineString" | "Polygon">("Polygon");
  const [manualName, setManualName] = useState("");
  const [manualLayer, setManualLayer] = useState("site");
  const [manualPlot, setManualPlot] = useState("");
  const [manualCoordinates, setManualCoordinates] = useState("");
  const calibrationDirty = useMemo(
    () => controlPointsSignature(controlPoints) !== controlPointsSignature(state.controlPoints || []),
    [controlPoints, state.controlPoints],
  );
  const plotMapperFeatures = useMemo(
    () => state.features.filter((feature) => feature.source === "plot_mapper"),
    [state.features],
  );
  const savedCalibrationFingerprint = useMemo(
    () => controlPointsFingerprint(state.controlPoints || []),
    [state.controlPoints],
  );
  const geoPlotGenerationFresh = useMemo(
    () =>
      plotMapperFeatures.length > 0 &&
      plotMapperFeatures.every(
        (feature) =>
          String(feature.properties?.calibrationFingerprint || "") ===
          savedCalibrationFingerprint,
      ),
    [plotMapperFeatures, savedCalibrationFingerprint],
  );
  const publishBlockedByStalePlots =
    plotMapperFeatures.length > 0 && !geoPlotGenerationFresh;

  async function load() {
    setLoading(true);
    setMigrationError("");
    try {
      const response = await fetch(
        `/api/super-geo-mapper?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as GeoState & { error?: string };
      if (!response.ok) {
        if (response.status === 503) setMigrationError(data.error || "Geo Mapper migration pending hai");
        throw new Error(data.error || "Geo Mapper load nahi hua");
      }
      setState(data);
      setControlPoints(data.controlPoints || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((error) => notify(error instanceof Error ? error.message : "Geo Mapper load nahi hua"));
  }, [projectId]);

  async function action(payload: Record<string, unknown>, refresh = true) {
    const response = await fetch("/api/super-geo-mapper", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, ...payload }),
    });
    const data = (await response.json()) as Partial<GeoState> & { error?: string };
    if (!response.ok) throw new Error(data.error || "Geo Mapper request failed");
    if (refresh && data.features && data.publish) {
      setState(data as GeoState);
      setControlPoints((data as GeoState).controlPoints || []);
    }
    return data;
  }

  async function saveControlPoints() {
    setBusy(true);
    try {
      await action({ action: "save_control_points", controlPoints });
      notify("Geo control points save ho gaye");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Control points save nahi hue");
    } finally {
      setBusy(false);
    }
  }

  async function generatePlots() {
    if (calibrationDirty) {
      notify("Calibration me unsaved changes hain. Pehle Save Calibration karein.");
      return;
    }
    setBusy(true);
    try {
      const data = (await action({ action: "generate_plot_features", controlPoints })) as Partial<GeoState> & { generated?: number };
      notify(`${Number(data.generated || 0)} Plot Mapper polygons Geo me generate hue`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Geo plots generate nahi hue");
    } finally {
      setBusy(false);
    }
  }

  async function addManualFeature() {
    setBusy(true);
    try {
      const geometry = parseCoordinateText(manualType, manualCoordinates);
      await action({
        action: "upsert_feature",
        feature: {
          name: manualName || "Manual feature",
          layer: manualLayer || "site",
          linkedPlotId: manualPlot || null,
          source: "manual",
          geometry,
        },
      });
      setManualName("");
      setManualCoordinates("");
      notify("Geo feature save ho gaya");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Geo feature save nahi hua");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      notify("Geo source file 5 MB se chhoti honi chahiye");
      return;
    }
    setBusy(true);
    let saved = 0;
    try {
      const parsed = importedFeatures(file, await file.text());
      if (!parsed.length) throw new Error("File me supported Geo features nahi mile");

      // Archive first so every live import has source provenance. Server SHA-256 dedupe
      // makes retry safe; stable generated IDs make the same file re-import repairable.
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("file", file);
      const archive = await fetch("/api/super-geo-mapper", { method: "POST", body: form });
      const archiveData = (await archive.json()) as { error?: string };
      if (!archive.ok) throw new Error(archiveData.error || "Source archive nahi hui");

      for (let index = 0; index < parsed.length; index += 80) {
        const chunk = parsed.slice(index, index + 80);
        await action({ action: "import_features", features: chunk }, false);
        saved += chunk.length;
      }
      await load();
      notify(`${parsed.length} Geo features import hue aur original source archive ho gaya`);
    } catch (error) {
      await load().catch(() => undefined);
      const message = error instanceof Error ? error.message : "Geo import fail hua";
      notify(saved ? `${message}. ${saved} features save hue; same file dobara import karke safely repair karein.` : message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteFeature(id: string) {
    setBusy(true);
    try {
      await action({ action: "delete_feature", id });
      notify("Geo feature delete ho gaya");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Geo feature delete nahi hua");
    } finally {
      setBusy(false);
    }
  }

  async function publishGeo() {
    setBusy(true);
    try {
      await action({
        action: state.publish.publicEnabled ? "unpublish" : "publish",
        expectedDraftRevision: state.publish.draftRevision,
      });
      notify(state.publish.publicEnabled ? "Geo public flag off ho gaya" : "Geo snapshot publish ho gaya");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Geo publish action fail hua");
    } finally {
      setBusy(false);
    }
  }

  function exportGeoJson() {
    const collection = {
      type: "FeatureCollection",
      features: state.features.map((feature) => ({
        type: "Feature",
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
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${projectId}-geo-v${state.publish.draftRevision}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const preview = useMemo(() => {
    const points = state.features.flatMap(featurePoints);
    if (!points.length) return null;
    let minLng = Math.min(...points.map((point) => point[0]));
    let maxLng = Math.max(...points.map((point) => point[0]));
    let minLat = Math.min(...points.map((point) => point[1]));
    let maxLat = Math.max(...points.map((point) => point[1]));
    if (maxLng - minLng < 1e-9) {
      minLng -= 0.0005;
      maxLng += 0.0005;
    }
    if (maxLat - minLat < 1e-9) {
      minLat -= 0.0005;
      maxLat += 0.0005;
    }
    const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 96 + 2;
    const y = (lat: number) => 58 - ((lat - minLat) / (maxLat - minLat)) * 56;
    return { x, y };
  }, [state.features]);

  if (loading) return <section className={`card ${styles.panel}`}>Geo Mapper load ho raha hai…</section>;

  if (migrationError)
    return (
      <section className={`card ${styles.panel}`}>
        <div className={styles.warning}><AlertCircle /> <div><b>Geo Mapper migration required</b><p>{migrationError}</p></div></div>
      </section>
    );

  return (
    <section className={`card ${styles.panel}`}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>REKIXO GEO MAPPER V1</p>
          <h2><MapPinned /> Geographic Project Layer</h2>
          <span>Existing Plot Mapper data read-only source hai. Geo data alag tables me save hota hai.</span>
        </div>
        <div className={state.publish.dirty ? styles.badgeWarn : styles.badgeOk}>
          {state.publish.dirty ? <AlertCircle /> : <CheckCircle2 />}
          Draft {state.publish.draftRevision} · Published {state.publish.publishedRevision}
        </div>
      </div>

      <div className={styles.guardrail}>
        Public website ka current 2D/3D behaviour is V1 se change nahi hota. “Geo publish” sirf immutable Geo snapshot banata hai; Satellite/Public integration future gated patch me hogi.
      </div>

      <div className={styles.toolbar}>
        <label className={styles.fileButton}>
          <Upload /> Import KML / GeoJSON
          <input
            type="file"
            accept=".kml,.geojson,.json,application/geo+json,application/json,application/vnd.google-earth.kml+xml"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) importFile(file);
            }}
          />
        </label>
        <button onClick={exportGeoJson} disabled={!state.features.length || busy}><Download /> Export GeoJSON</button>
        <button onClick={() => load().catch(() => notify("Refresh fail hua"))} disabled={busy}><RefreshCw /> Refresh</button>
        <button
          className={state.publish.publicEnabled ? styles.secondaryDanger : styles.primary}
          onClick={publishGeo}
          disabled={
            busy ||
            (!state.features.length && !state.publish.publicEnabled) ||
            (!state.publish.publicEnabled &&
              (calibrationDirty || publishBlockedByStalePlots))
          }
          title={
            !state.publish.publicEnabled && calibrationDirty
              ? "Pehle Save Calibration karein"
              : !state.publish.publicEnabled && publishBlockedByStalePlots
                ? "Saved calibration ke saath Geo plots regenerate karein"
                : undefined
          }
        >
          <Rocket /> {state.publish.publicEnabled ? "Disable Geo Publish" : "Publish Geo Snapshot"}
        </button>
      </div>

      <div className={styles.stats}>
        <div><b>{state.features.length}</b><span>Geo features</span></div>
        <div><b>{state.plots.length}</b><span>Mapped plots available</span></div>
        <div><b>{controlPoints.length}</b><span>Control points</span></div>
        <div>
          <b>
            {calibrationDirty
              ? "Unsaved"
              : state.calibrationDiagnostics?.validationMeanErrorMeters != null
                ? `${state.calibrationDiagnostics.validationMeanErrorMeters.toFixed(2)} m`
                : controlPoints.length === 4 && state.calibrationDiagnostics
                  ? "Exact-fit"
                  : state.calibrationErrorMeters == null
                    ? "—"
                    : `${state.calibrationErrorMeters.toFixed(2)} m`}
          </b>
          <span>
            {calibrationDirty
              ? "Save to recalculate"
              : state.calibrationDiagnostics?.validationMeanErrorMeters != null
                ? `LOO validation mean · ${state.calibrationDiagnostics.validationCoverage}/${state.calibrationDiagnostics.pointCount}`
                : controlPoints.length === 4 && state.calibrationDiagnostics
                  ? "Add 1+ independent point to validate"
                  : "Calibration fit mean error"}
          </span>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.block}>
          <div className={styles.blockHead}><div><h3>Masterplan → WGS84 calibration</h3><p>Source X/Y normalized 0..1; target longitude/latitude real GPS coordinates.</p></div><button onClick={() => setControlPoints((items) => [...items, { id: crypto.randomUUID(), source: [0.5, 0.5], target: [0, 0], sourceSet: false, label: "" }])} disabled={controlPoints.length >= 12 || busy}><Plus /> Point</button></div>
          <GeoVisualCalibrationGuard
            key={`geo-visual:${projectId}`}
            notify={notify}
          >
            <GeoVisualCalibration
              projectId={projectId}
              controlPoints={controlPoints}
              savedControlPoints={state.controlPoints || []}
              diagnostics={calibrationDirty ? null : state.calibrationDiagnostics}
              calibrationDirty={calibrationDirty}
              onChange={setControlPoints}
              onSaveCalibration={saveControlPoints}
              disabled={busy}
              notify={notify}
            />
          </GeoVisualCalibrationGuard>
          <div className={styles.controlList}>
            {controlPoints.map((point, index) => (
              <div className={styles.controlRow} key={point.id}>
                <input aria-label={`Control ${index + 1} label`} placeholder={`Point ${index + 1}`} value={point.label || ""} onChange={(event) => setControlPoints((items) => items.map((item) => item.id === point.id ? { ...item, label: event.target.value } : item))} />
                <input aria-label="Source X" type="number" min="0" max="1" step="0.000001" value={point.source[0]} onChange={(event) => setControlPoints((items) => items.map((item) => item.id === point.id ? { ...item, source: [Number(event.target.value), item.source[1]] } : item))} />
                <input aria-label="Source Y" type="number" min="0" max="1" step="0.000001" value={point.source[1]} onChange={(event) => setControlPoints((items) => items.map((item) => item.id === point.id ? { ...item, source: [item.source[0], Number(event.target.value)] } : item))} />
                <input aria-label="Longitude" type="number" min="-180" max="180" step="0.0000001" value={point.target[0]} onChange={(event) => setControlPoints((items) => items.map((item) => item.id === point.id ? { ...item, target: [Number(event.target.value), item.target[1]] } : item))} />
                <input aria-label="Latitude" type="number" min="-90" max="90" step="0.0000001" value={point.target[1]} onChange={(event) => setControlPoints((items) => items.map((item) => item.id === point.id ? { ...item, target: [item.target[0], Number(event.target.value)] } : item))} />
                <button aria-label="Remove control point" onClick={() => setControlPoints((items) => items.filter((item) => item.id !== point.id))} disabled={busy}><Trash2 /></button>
              </div>
            ))}
            {!controlPoints.length ? <p className={styles.empty}>Kam se kam 4 door-door control points add karein.</p> : null}
          </div>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={saveControlPoints} disabled={busy}><Save /> Save Calibration</button>
            <button onClick={generatePlots} disabled={busy || calibrationDirty || controlPoints.length < 4 || !state.plots.length}><MapPinned /> Generate Geo Plots</button>
          </div>
          {calibrationDirty ? <p className={styles.inlineWarn}>Unsaved calibration changes hain. Generate se pehle Save Calibration karein.</p> : null}
          {!calibrationDirty && publishBlockedByStalePlots ? (
            <p className={styles.inlineWarn}>
              Saved calibration aur generated Plot Mapper Geo polygons match nahi karte. `Generate Geo Plots`
              dobara chala kar review karein; tabhi Geo Publish enable hoga.
            </p>
          ) : null}
        </div>

        <div className={styles.block}>
          <h3>Manual Geo feature</h3>
          <div className={styles.formGrid}>
            <label><span>Type</span><select value={manualType} onChange={(event) => setManualType(event.target.value as typeof manualType)}><option>Polygon</option><option>LineString</option><option>Point</option></select></label>
            <label><span>Layer</span><input value={manualLayer} onChange={(event) => setManualLayer(event.target.value)} placeholder="site / road / amenity" /></label>
            <label><span>Name</span><input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Main gate / boundary" /></label>
            <label><span>Linked plot</span><select value={manualPlot} onChange={(event) => setManualPlot(event.target.value)}><option value="">None</option>{state.plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.id} · {plot.status}</option>)}</select></label>
            <label className={styles.wide}><span>Coordinates — one “longitude, latitude” per line</span><textarea rows={7} value={manualCoordinates} onChange={(event) => setManualCoordinates(event.target.value)} placeholder={manualType === "Point" ? "81.123456, 21.123456" : "81.123456, 21.123456\n81.124000, 21.123700\n81.123800, 21.124100"} /></label>
          </div>
          <button className={styles.primary} onClick={addManualFeature} disabled={busy || !manualCoordinates.trim()}><Save /> Save Feature</button>
        </div>
      </div>

      <div className={styles.previewBlock}>
        <div className={styles.blockHead}><div><h3>Geo preview</h3><p>Data-space preview only; no external map SDK or API key required.</p></div></div>
        <div className={styles.preview}>
          {preview ? (
            <svg viewBox="0 0 100 60" role="img" aria-label="Geo features preview" preserveAspectRatio="xMidYMid meet">
              <rect x="0" y="0" width="100" height="60" className={styles.previewBg} />
              {state.features.map((feature) => {
                if (feature.geometry.type === "Point") {
                  const [lng, lat] = feature.geometry.coordinates;
                  return <circle key={feature.id} cx={preview.x(lng)} cy={preview.y(lat)} r="0.9" className={styles.previewPoint} />;
                }
                if (feature.geometry.type === "LineString") {
                  const points = feature.geometry.coordinates.map(([lng, lat]) => `${preview.x(lng)},${preview.y(lat)}`).join(" ");
                  return <polyline key={feature.id} points={points} className={styles.previewLine} />;
                }
                return feature.geometry.coordinates.map((ring, ringIndex) => {
                  const points = ring.map(([lng, lat]) => `${preview.x(lng)},${preview.y(lat)}`).join(" ");
                  return <polygon key={`${feature.id}:${ringIndex}`} points={points} className={styles.previewPolygon} />;
                });
              })}
            </svg>
          ) : <div className={styles.empty}>Import ya manual Geo feature add karne par preview yahan dikhega.</div>}
        </div>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}><div><h3>Geo features</h3><p>Plot Mapper polygons yahan copy hote hain; original <code>plots.polygon</code> kabhi mutate nahi hota.</p></div></div>
        <div className={styles.featureTable}>
          <div className={styles.featureHeader}><span>Name</span><span>Layer</span><span>Type</span><span>Plot</span><span>Source</span><span /></div>
          {state.features.map((feature) => (
            <div className={styles.featureRow} key={feature.id}>
              <span><b>{feature.name || feature.id}</b><small>{feature.id}</small></span>
              <span>{feature.layer}</span><span>{feature.geometryType}</span><span>{feature.linkedPlotId || "—"}</span><span>{feature.source}</span>
              <button aria-label={`Delete ${feature.name || feature.id}`} onClick={() => deleteFeature(feature.id)} disabled={busy}><Trash2 /></button>
            </div>
          ))}
          {!state.features.length ? <p className={styles.empty}>Abhi koi Geo feature saved nahi hai.</p> : null}
        </div>
      </div>

      {state.sources.length ? (
        <div className={styles.sources}>
          <h3>Immutable source archive</h3>
          {state.sources.map((source) => <div key={source.id}><span>{source.filename}</span><small>{Math.ceil(source.sizeBytes / 1024)} KB · SHA-256 {source.sha256.slice(0, 12)}…</small></div>)}
        </div>
      ) : null}
    </section>
  );
}
