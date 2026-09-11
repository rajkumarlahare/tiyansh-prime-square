"use client";

import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Crosshair, KeyRound, LocateFixed, Map as MapIcon, Save, Satellite, Trash2 } from "lucide-react";
import { mapNormalizedPointToGeo, solveGeoCalibration } from "./geo-calibration";
import { solveHomography, type MapperPoint } from "./mapper-geometry";
import MasterplanMaskEditor from "./masterplan-mask-editor";
// REKIXO_GEO_MASTERPLAN_OVERLAY_V2_7
import styles from "./geo-visual-calibration.module.css";

type ControlPoint = {
  id: string;
  source: [number, number];
  target: [number, number];
  sourceSet?: boolean;
  label?: string;
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

type GeoPreviewFeature = {
  id: string;
  name: string;
  linkedPlotId: string | null;
  source: string;
  geometry: { type: string; coordinates: unknown };
};

type GeoPreviewPlot = {
  id: string;
  status: string;
  sqft: number;
  sqm: number;
  sqyd: number;
  dimensions: string;
  road: string;
};

type MapConfig = {
  lab: boolean;
  mapsEnabled: boolean;
  apiKey?: string | null;
  configured?: boolean;
  maskedKey?: string | null;
  keySource?: "saved" | "env" | null;
  error?: string;
};

type GoogleLatLng = {
  lat(): number;
  lng(): number;
};

type GoogleMapMouseEvent = {
  latLng?: GoogleLatLng | null;
};

type GoogleListener = {
  remove?: () => void;
};

type GoogleMapInstance = {
  addListener(eventName: string, listener: (event: GoogleMapMouseEvent) => void): GoogleListener;
  setCenter(center: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};

type GoogleCircle = {
  setMap(map: GoogleMapInstance | null): void;
};

type GooglePixel = { x: number; y: number };

type GoogleMapProjection = {
  fromLatLngToDivPixel(latLng: GoogleLatLng): GooglePixel | null;
};

type GoogleMapPanes = {
  overlayLayer: HTMLElement;
};

type GoogleOverlayView = {
  onAdd?: () => void;
  draw?: () => void;
  onRemove?: () => void;
  setMap(map: GoogleMapInstance | null): void;
  getProjection(): GoogleMapProjection;
  getPanes(): GoogleMapPanes;
};

type GooglePolygon = {
  addListener(eventName: string, listener: (event: GoogleMapMouseEvent) => void): GoogleListener;
  setMap(map: GoogleMapInstance | null): void;
};

type GoogleInfoWindow = {
  setContent(content: Node | string): void;
  setPosition(position: { lat: number; lng: number }): void;
  open(options: { map: GoogleMapInstance }): void;
  close(): void;
};

type GoogleRoot = {
  maps: {
    Map: new (
      node: HTMLElement,
      options: Record<string, unknown>,
    ) => GoogleMapInstance;
    Circle: new (options: Record<string, unknown>) => GoogleCircle;
    LatLng: new (lat: number, lng: number) => GoogleLatLng;
    OverlayView: new () => GoogleOverlayView;
    Polygon: new (options: Record<string, unknown>) => GooglePolygon;
    InfoWindow: new (options?: Record<string, unknown>) => GoogleInfoWindow;
  };
};

type RekixoWindow = Window &
  typeof globalThis & {
    google?: GoogleRoot;
    __rekixoGeoMapsReady?: () => void;
  };

let mapsPromise: Promise<GoogleRoot> | null = null;

function browserWindow() {
  return window as RekixoWindow;
}

function loadGoogleMaps(apiKey: string) {
  const current = browserWindow().google;
  if (current?.maps?.Map) return Promise.resolve(current);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<GoogleRoot>((resolve, reject) => {
    const win = browserWindow();
    const callbackName = "__rekixoGeoMapsReady";
    const complete = () => {
      if (win.google?.maps?.Map) {
        resolve(win.google);
        return;
      }
      mapsPromise = null;
      reject(new Error("Google Maps JavaScript API load nahi hui"));
    };

    win[callbackName] = complete;
    const existing = document.getElementById("rekixo-google-maps-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", complete, { once: true });
      existing.addEventListener(
        "error",
        () => {
          mapsPromise = null;
          reject(new Error("Google Maps JavaScript API load fail hui"));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "rekixo-google-maps-js";
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=weekly&loading=async&callback=${callbackName}`;
    script.onerror = () => {
      mapsPromise = null;
      reject(new Error("Google Maps JavaScript API load fail hui"));
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

function validTarget(point: ControlPoint) {
  const [lng, lat] = point.target;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    !(Math.abs(lng) < 1e-12 && Math.abs(lat) < 1e-12)
  );
}

function parseCenter(value: string) {
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite))
    throw new Error("Map center `latitude, longitude` format me dein");
  const [lat, lng] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180)
    throw new Error("Map center latitude/longitude range invalid hai");
  return { lat, lng };
}

const MASTERPLAN_ZOOM_MIN = 1;
const MASTERPLAN_ZOOM_MAX = 8;
const MASTERPLAN_ZOOM_STEP = 0.5;

function hasPlacedSource(point: ControlPoint) {
  return (
    point.sourceSet !== false ||
    Math.abs(point.source[0] - 0.5) > 1e-12 ||
    Math.abs(point.source[1] - 0.5) > 1e-12
  );
}

function sameCalibrationPoint(a: ControlPoint, b: ControlPoint) {
  return (
    a.id === b.id &&
    Number(a.source[0]) === Number(b.source[0]) &&
    Number(a.source[1]) === Number(b.source[1]) &&
    Number(a.target[0]) === Number(b.target[0]) &&
    Number(a.target[1]) === Number(b.target[1]) &&
    String(a.label || "") === String(b.label || "")
  );
}

function geoPolygonPath(feature: GeoPreviewFeature) {
  if (feature.geometry?.type !== "Polygon") return [] as [number, number][];
  const rings = feature.geometry.coordinates;
  if (!Array.isArray(rings) || !Array.isArray(rings[0])) return [] as [number, number][];
  const output: [number, number][] = [];
  for (const raw of rings[0]) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const lng = Number(raw[0]);
    const lat = Number(raw[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    output.push([lng, lat]);
  }
  return output;
}

function geoPlotStyle(status: string) {
  const normalized = String(status || "available").toLowerCase();
  if (normalized === "sold") {
    return { fillColor: "#ef334e", strokeColor: "#ff6b7f" };
  }
  if (normalized === "booked" || normalized === "hold") {
    return { fillColor: "#f4b51f", strokeColor: "#ffd45f" };
  }
  return { fillColor: "#18b968", strokeColor: "#63e6ad" };
}

function cssProjectiveTransform(matrix: number[], width: number, height: number) {
  if (matrix.length !== 9 || !(width > 0) || !(height > 0)) return "";
  const a = matrix[0] / width;
  const b = matrix[1] / height;
  const c = matrix[2];
  const d = matrix[3] / width;
  const e = matrix[4] / height;
  const f = matrix[5];
  const g = matrix[6] / width;
  const h = matrix[7] / height;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}

export default function GeoVisualCalibration({
  projectId,
  controlPoints,
  savedControlPoints,
  features,
  plots,
  diagnostics,
  calibrationDirty,
  onChange,
  onSaveCalibration,
  disabled,
  notify,
}: {
  projectId: string;
  controlPoints: ControlPoint[];
  savedControlPoints: ControlPoint[];
  features: GeoPreviewFeature[];
  plots: GeoPreviewPlot[];
  diagnostics: CalibrationDiagnostics | null;
  calibrationDirty: boolean;
  onChange: Dispatch<SetStateAction<ControlPoint[]>>;
  onSaveCalibration: () => void | Promise<void>;
  disabled: boolean;
  notify: (message: string) => void;
}) {
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [activeId, setActiveId] = useState("");
  const [masterplanReady, setMasterplanReady] = useState(false);
  const [masterplanError, setMasterplanError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [centerText, setCenterText] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [satelliteRequested, setSatelliteRequested] = useState(false);
  const [masterplanZoom, setMasterplanZoom] = useState(MASTERPLAN_ZOOM_MIN);
  const [masterplanPan, setMasterplanPan] = useState({ x: 0, y: 0 });
  const [masterplanTool, setMasterplanTool] = useState<"point" | "pan">("point");
  const [showMasterplanOverlay, setShowMasterplanOverlay] = useState(false);
  const [showPlotOverlay, setShowPlotOverlay] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.68);
  const [maskedMasterplanPreviewUrl, setMaskedMasterplanPreviewUrl] = useState<string | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const clickListenerRef = useRef<GoogleListener | null>(null);
  const circlesRef = useRef<GoogleCircle[]>([]);
  const masterplanOverlayRef = useRef<GoogleOverlayView | null>(null);
  const mapPlotPolygonsRef = useRef<GooglePolygon[]>([]);
  const mapInfoWindowRef = useRef<GoogleInfoWindow | null>(null);
  const suppressNextMapClickRef = useRef(false);
  const activeIdRef = useRef("");
  const masterplanPanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const knownPointIdsRef = useRef(new Set(controlPoints.map((point) => point.id)));

  const activeIndex = useMemo(
    () => controlPoints.findIndex((point) => point.id === activeId),
    [controlPoints, activeId],
  );
  const savedPointById = useMemo(
    () => new globalThis.Map(savedControlPoints.map((point) => [point.id, point])),
    [savedControlPoints],
  );
  const pointSaveState = (point: ControlPoint): "saved" | "unsaved" | "new" => {
    const savedPoint = savedPointById.get(point.id);
    if (!savedPoint) return "new";
    return sameCalibrationPoint(point, savedPoint) ? "saved" : "unsaved";
  };
  const diagnosticById = useMemo(
    () => new globalThis.Map((diagnostics?.points || []).map((point) => [point.id, point])),
    [diagnostics],
  );
  const worstPointIndex = useMemo(
    () =>
      diagnostics?.worstPointId
        ? controlPoints.findIndex((point) => point.id === diagnostics.worstPointId)
        : -1,
    [controlPoints, diagnostics?.worstPointId],
  );

  const previewCalibration = useMemo(() => {
    const usable = controlPoints.filter(
      (point) => hasPlacedSource(point) && validTarget(point),
    );
    if (usable.length < 4) return null;
    try {
      return solveGeoCalibration(
        usable.map((point) => ({
          id: point.id,
          source: point.source,
          target: point.target,
          label: point.label,
        })),
      );
    } catch {
      return null;
    }
  }, [controlPoints]);

  const previewPlotFeatures = useMemo(
    () => features.filter((feature) => feature.source === "plot_mapper"),
    [features],
  );
  const previewPlotById = useMemo(
    () => new globalThis.Map(plots.map((plot) => [plot.id, plot])),
    [plots],
  );
  const masterplanUrl =
    `/api/project-asset/masterplan?projectId=${encodeURIComponent(projectId)}` +
    "&preview=1&v=geo-masterplan-overlay-v2-7";
  const overlayMasterplanUrl = maskedMasterplanPreviewUrl || masterplanUrl;

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    const currentIds = new Set(controlPoints.map((point) => point.id));
    const addedPoint = controlPoints.find(
      (point) => !knownPointIdsRef.current.has(point.id),
    );
    knownPointIdsRef.current = currentIds;
    if (!controlPoints.length) {
      setActiveId("");
      return;
    }
    if (addedPoint) {
      setActiveId(addedPoint.id);
      setMasterplanTool("point");
      return;
    }
    if (!controlPoints.some((point) => point.id === activeId)) {
      setActiveId(controlPoints[0].id);
    }
  }, [controlPoints, activeId]);

  useEffect(() => {
    let live = true;
    setConfig(null);
    fetch(`/api/super-geo-map-config?projectId=${encodeURIComponent(projectId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as MapConfig;
        if (!response.ok) throw new Error(data.error || "Geo map config load nahi hui");
        return data;
      })
      .then((data) => {
        if (live) setConfig(data);
      })
      .catch((error) => {
        if (!live) return;
        setConfig({ lab: false, mapsEnabled: false });
        notify(error instanceof Error ? error.message : "Geo map config load nahi hui");
      });
    return () => {
      live = false;
    };
  }, [projectId, notify]);

  useEffect(() => {
    if (
      !satelliteRequested ||
      !config?.lab ||
      !config.mapsEnabled ||
      !config.apiKey ||
      !mapNodeRef.current
    ) return;
    let cancelled = false;
    setMapError("");
    setMapReady(false);

    loadGoogleMaps(config.apiKey)
      .then((google) => {
        if (cancelled || !mapNodeRef.current) return;
        const firstTarget = controlPoints.find(validTarget);
        const center = firstTarget
          ? { lat: firstTarget.target[1], lng: firstTarget.target[0] }
          : { lat: 20.5937, lng: 78.9629 };
        const map = new google.maps.Map(mapNodeRef.current, {
          center,
          zoom: firstTarget ? 19 : 5,
          mapTypeId: "satellite",
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
          tilt: 0,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        clickListenerRef.current = map.addListener("click", (event) => {
          if (suppressNextMapClickRef.current) {
            suppressNextMapClickRef.current = false;
            return;
          }
          const targetId = activeIdRef.current;
          const latLng = event.latLng;
          if (!targetId || !latLng) {
            notify("Pehle control point select karein");
            return;
          }
          const lng = Number(latLng.lng().toFixed(7));
          const lat = Number(latLng.lat().toFixed(7));
          onChange((items) =>
            items.map((item) =>
              item.id === targetId ? { ...item, target: [lng, lat] } : item,
            ),
          );
          setCenterText(`${lat.toFixed(7)}, ${lng.toFixed(7)}`);
        });
        setMapReady(true);
      })
      .catch((error) => {
        if (!cancelled)
          setMapError(error instanceof Error ? error.message : "Satellite map load fail hui");
      });

    return () => {
      cancelled = true;
      clickListenerRef.current?.remove?.();
      clickListenerRef.current = null;
      circlesRef.current.forEach((circle) => circle.setMap(null));
      circlesRef.current = [];
      masterplanOverlayRef.current?.setMap(null);
      masterplanOverlayRef.current = null;
      mapPlotPolygonsRef.current.forEach((polygon) => polygon.setMap(null));
      mapPlotPolygonsRef.current = [];
      mapInfoWindowRef.current?.close();
      mapInfoWindowRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
    // Map initializes once per project/config. Point overlays are maintained separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    satelliteRequested,
    config?.lab,
    config?.mapsEnabled,
    config?.apiKey,
    projectId,
    notify,
    onChange,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const google = browserWindow().google;
    if (!mapReady || !map || !google?.maps?.Circle) return;
    circlesRef.current.forEach((circle) => circle.setMap(null));
    circlesRef.current = controlPoints
      .filter(validTarget)
      .map((point) => {
        const active = point.id === activeId;
        return new google.maps.Circle({
          map,
          center: { lat: point.target[1], lng: point.target[0] },
          radius: active ? 3.5 : 2.2,
          fillColor: active ? "#ffcb45" : "#44d7a8",
          fillOpacity: 0.95,
          strokeColor: "#071221",
          strokeOpacity: 1,
          strokeWeight: 2,
          clickable: false,
        });
      });
  }, [controlPoints, activeId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const google = browserWindow().google;
    masterplanOverlayRef.current?.setMap(null);
    masterplanOverlayRef.current = null;

    if (
      !mapReady ||
      !map ||
      !google?.maps?.OverlayView ||
      !google.maps.LatLng ||
      !showMasterplanOverlay ||
      !previewCalibration
    ) {
      return;
    }

    const sourceCorners: MapperPoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    let geoCorners: [number, number][];
    try {
      geoCorners = sourceCorners.map((corner) =>
        mapNormalizedPointToGeo(previewCalibration, corner),
      );
    } catch {
      notify("Masterplan overlay calibration invalid hai");
      return;
    }

    const overlay = new google.maps.OverlayView();
    let host: HTMLDivElement | null = null;
    let image: HTMLImageElement | null = null;

    const draw = () => {
      if (!host || !image || !image.naturalWidth || !image.naturalHeight) return;
      const projection = overlay.getProjection();
      const targets = geoCorners.map(([lng, lat]) =>
        projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng)),
      );
      if (targets.some((point) => !point)) return;
      try {
        const matrix = solveHomography(
          sourceCorners.map((source, index) => ({
            source,
            target: [targets[index]!.x, targets[index]!.y] as MapperPoint,
          })),
        );
        host.style.transform = cssProjectiveTransform(
          matrix,
          image.naturalWidth,
          image.naturalHeight,
        );
      } catch {
        host.style.visibility = "hidden";
      }
    };

    overlay.onAdd = () => {
      host = document.createElement("div");
      host.className = styles.geoMasterplanOverlay;
      host.style.opacity = String(overlayOpacity);
      image = document.createElement("img");
      image.src = overlayMasterplanUrl;
      image.alt = "Calibrated masterplan overlay";
      image.draggable = false;
      image.decoding = "async";
      image.onload = () => {
        if (host) host.style.visibility = "visible";
        draw();
      };
      image.onerror = () => notify("Masterplan overlay image load nahi hui");
      host.appendChild(image);
      overlay.getPanes().overlayLayer.appendChild(host);
    };
    overlay.draw = draw;
    overlay.onRemove = () => {
      image?.remove();
      host?.remove();
      image = null;
      host = null;
    };
    overlay.setMap(map);
    masterplanOverlayRef.current = overlay;

    return () => {
      if (masterplanOverlayRef.current === overlay) {
        masterplanOverlayRef.current = null;
      }
      overlay.setMap(null);
    };
  }, [
    mapReady,
    overlayMasterplanUrl,
    notify,
    overlayOpacity,
    previewCalibration,
    showMasterplanOverlay,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const google = browserWindow().google;

    mapPlotPolygonsRef.current.forEach((polygon) => polygon.setMap(null));
    mapPlotPolygonsRef.current = [];
    mapInfoWindowRef.current?.close();
    mapInfoWindowRef.current = null;

    if (
      !mapReady ||
      !map ||
      calibrationDirty ||
      !showPlotOverlay ||
      !google?.maps?.Polygon ||
      !google.maps.InfoWindow
    ) {
      return;
    }

    const info = new google.maps.InfoWindow();
    mapInfoWindowRef.current = info;
    const rendered: GooglePolygon[] = [];

    for (const feature of previewPlotFeatures) {
      const path = geoPolygonPath(feature);
      if (path.length < 3) continue;
      const plot = feature.linkedPlotId
        ? previewPlotById.get(feature.linkedPlotId)
        : undefined;
      const style = geoPlotStyle(plot?.status || "available");
      const polygon = new google.maps.Polygon({
        map,
        paths: path.map(([lng, lat]) => ({ lat, lng })),
        clickable: true,
        fillColor: style.fillColor,
        fillOpacity: 0.07,
        strokeColor: style.strokeColor,
        strokeOpacity: 0.9,
        strokeWeight: 1.5,
        zIndex: 30,
      });
      polygon.addListener("click", (event) => {
        suppressNextMapClickRef.current = true;
        window.setTimeout(() => {
          suppressNextMapClickRef.current = false;
        }, 0);

        const card = document.createElement("div");
        card.className = styles.geoPlotInfo;
        const title = document.createElement("strong");
        title.textContent = plot?.id ? `Plot ${plot.id}` : feature.name || "Plot";
        card.appendChild(title);

        const status = document.createElement("span");
        status.textContent = `Status: ${plot?.status || "available"}`;
        card.appendChild(status);

        if (plot) {
          const area = document.createElement("span");
          area.textContent = plot.sqft
            ? `Area: ${Number(plot.sqft).toLocaleString("en-IN")} Sq.Ft`
            : plot.sqyd
              ? `Area: ${Number(plot.sqyd).toLocaleString("en-IN")} Sq.Yd`
              : "";
          if (area.textContent) card.appendChild(area);

          if (plot.dimensions) {
            const dimensions = document.createElement("span");
            dimensions.textContent = `Dimensions: ${plot.dimensions}`;
            card.appendChild(dimensions);
          }
          if (plot.road) {
            const road = document.createElement("span");
            road.textContent = `Road: ${plot.road}`;
            card.appendChild(road);
          }
        }

        info.setContent(card);
        const fallback = path[0];
        const latLng = event.latLng;
        info.setPosition(
          latLng
            ? { lat: latLng.lat(), lng: latLng.lng() }
            : { lat: fallback[1], lng: fallback[0] },
        );
        info.open({ map });
      });
      rendered.push(polygon);
    }

    mapPlotPolygonsRef.current = rendered;
    return () => {
      rendered.forEach((polygon) => polygon.setMap(null));
      if (mapPlotPolygonsRef.current === rendered) {
        mapPlotPolygonsRef.current = [];
      }
      if (mapInfoWindowRef.current === info) {
        info.close();
        mapInfoWindowRef.current = null;
      }
    };
  }, [
    calibrationDirty,
    mapReady,
    previewPlotById,
    previewPlotFeatures,
    showPlotOverlay,
  ]);

  if (!config?.lab) return null;

  const activePoint = activeIndex >= 0 ? controlPoints[activeIndex] : null;
  const activeSaveState = activePoint ? pointSaveState(activePoint) : null;

  function updateActiveSource(event: ReactPointerEvent<HTMLImageElement>) {
    if (masterplanTool !== "point") return;
    if (disabled || !activePoint) {
      notify("Pehle + Point add karke control point select karein");
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    onChange((items) =>
      items.map((item) =>
        item.id === activePoint.id
          ? {
              ...item,
              source: [Number(x.toFixed(7)), Number(y.toFixed(7))],
              sourceSet: true,
            }
          : item,
      ),
    );
  }

  function setMasterplanZoomLevel(value: number) {
    const next = Math.min(
      MASTERPLAN_ZOOM_MAX,
      Math.max(MASTERPLAN_ZOOM_MIN, Number(value.toFixed(2))),
    );
    setMasterplanZoom(next);
    if (next === MASTERPLAN_ZOOM_MIN) {
      setMasterplanPan({ x: 0, y: 0 });
      if (masterplanTool === "pan") setMasterplanTool("point");
    }
  }

  function zoomMasterplanWithWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (disabled || Math.abs(event.deltaY) < 1) return;
    event.preventDefault();
    setMasterplanZoomLevel(
      masterplanZoom +
        (event.deltaY < 0 ? MASTERPLAN_ZOOM_STEP : -MASTERPLAN_ZOOM_STEP),
    );
  }

  function beginMasterplanPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || masterplanTool !== "pan" || masterplanZoom <= MASTERPLAN_ZOOM_MIN) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    masterplanPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: masterplanPan.x,
      originY: masterplanPan.y,
    };
  }

  function moveMasterplanPan(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = masterplanPanRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    setMasterplanPan({
      x: gesture.originX + event.clientX - gesture.startX,
      y: gesture.originY + event.clientY - gesture.startY,
    });
  }

  function endMasterplanPan(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = masterplanPanRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    masterplanPanRef.current = null;
  }

  function resetMasterplanView() {
    masterplanPanRef.current = null;
    setMasterplanZoom(MASTERPLAN_ZOOM_MIN);
    setMasterplanPan({ x: 0, y: 0 });
    setMasterplanTool("point");
  }

  function goToCenter() {
    try {
      const center = parseCenter(centerText);
      if (!mapRef.current) throw new Error("Satellite map abhi ready nahi hai");
      mapRef.current.setCenter(center);
      mapRef.current.setZoom(19);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Map center invalid hai");
    }
  }

  function focusActiveTarget() {
    if (!activePoint || !validTarget(activePoint) || !mapRef.current) {
      notify("Selected point ka satellite coordinate abhi set nahi hai");
      return;
    }
    mapRef.current.setCenter({ lat: activePoint.target[1], lng: activePoint.target[0] });
    mapRef.current.setZoom(20);
    setCenterText(
      `${activePoint.target[1].toFixed(7)}, ${activePoint.target[0].toFixed(7)}`,
    );
  }

  async function saveMapsKey() {
    const apiKey = keyInput.trim();
    if (!apiKey) {
      notify("Google Maps browser API key paste karein");
      return;
    }
    setKeyBusy(true);
    try {
      const response = await fetch("/api/super-geo-map-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, action: "save_key", apiKey }),
      });
      const data = (await response.json()) as MapConfig;
      if (!response.ok) throw new Error(data.error || "Maps key save nahi hui");
      setSatelliteRequested(false);
      setMapError("");
      setMapReady(false);
      setConfig(data);
      setKeyInput("");
      notify("Maps key save ho gayi. Ab `Load Google Satellite` dabayein.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Maps key save nahi hui");
    } finally {
      setKeyBusy(false);
    }
  }

  async function clearSavedMapsKey() {
    setKeyBusy(true);
    try {
      const response = await fetch("/api/super-geo-map-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, action: "clear_saved_key" }),
      });
      const data = (await response.json()) as MapConfig;
      if (!response.ok) throw new Error(data.error || "Saved Maps key clear nahi hui");
      setSatelliteRequested(false);
      setMapError("");
      setMapReady(false);
      setConfig(data);
      setKeyInput("");
      notify(
        data.mapsEnabled
          ? "Saved key clear ho gayi; Cloudflare environment fallback ready hai."
          : "Saved Maps key clear ho gayi.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Saved Maps key clear nahi hui");
    } finally {
      setKeyBusy(false);
    }
  }

  return (
    <div className={styles.visual}>
      <div className={styles.topline}>
        <div>
          <b>Visual control-point pairing · GEO LAB only</b>
          <span>
            Point choose karein → masterplan par same landmark tap karein → satellite par wahi
            real landmark tap karein.
          </span>
        </div>
        <div
          className={`${styles.active} ${
            activeSaveState === "saved"
              ? styles.activeSaved
              : activeSaveState
                ? styles.activeDirty
                : ""
          }`}
        >
          <Crosshair />
          <span>{activePoint ? `Point ${activeIndex + 1}` : "No point"}</span>
          {activeSaveState ? (
            <small>
              {activeSaveState === "saved"
                ? "Saved ✓"
                : activeSaveState === "new"
                  ? "New · unsaved"
                  : "Unsaved"}
            </small>
          ) : null}
        </div>
      </div>

      <div className={styles.keyPanel}>
        <div className={styles.keyHeading}>
          <KeyRound />
          <div>
            <b>Google Satellite key</b>
            <span>
              {config.configured
                ? `${config.maskedKey || "Configured"} · ${
                    config.keySource === "saved" ? "saved in Super Admin" : "Cloudflare env fallback"
                  }`
                : "Not configured"}
            </span>
          </div>
        </div>
        <div className={styles.keyControls}>
          <input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder={
              config.configured
                ? "Replacement Google Maps browser key paste karein"
                : "Google Maps browser key paste karein"
            }
            autoComplete="off"
            spellCheck={false}
            disabled={disabled || keyBusy}
          />
          <button
            type="button"
            onClick={saveMapsKey}
            disabled={disabled || keyBusy || !keyInput.trim()}
          >
            <Save /> {keyBusy ? "Saving…" : "Save Maps Key"}
          </button>
          {config.keySource === "saved" ? (
            <button
              type="button"
              className={styles.keyDanger}
              onClick={clearSavedMapsKey}
              disabled={disabled || keyBusy}
            >
              <Trash2 /> Remove Saved
            </button>
          ) : null}
        </div>
        <small>
          Ye browser key authenticated Super Admin Geo Lab ke liye global setting hai; kisi client
          project me save nahi hoti. Google Cloud me `https://admin.rekixo.com/*` aur Maps
          JavaScript API restriction enabled rakhein. Browser key browser me visible hona expected hai.
        </small>
      </div>

      {controlPoints.length ? (
        <div className={styles.pointTabs}>
          {controlPoints.map((point, index) => {
            const diagnostic = diagnosticById.get(point.id);
            const validationError = diagnostic?.validationErrorMeters;
            const saveState = pointSaveState(point);
            const classes = [
              point.id === activeId ? styles.pointActive : "",
              point.id === diagnostics?.worstPointId ? styles.pointWorst : "",
              saveState === "saved" ? styles.pointSaved : styles.pointUnsaved,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                type="button"
                key={point.id}
                className={classes}
                onClick={() => {
                  setActiveId(point.id);
                  setMasterplanTool("point");
                }}
                disabled={disabled}
                title={
                  validationError != null
                    ? `Leave-one-out residual ${validationError.toFixed(2)} m`
                    : undefined
                }
              >
                P{index + 1}
                <small className={styles.pointSaveState}>
                  {saveState === "saved"
                    ? "Saved ✓"
                    : saveState === "new"
                      ? "New · unsaved"
                      : "Unsaved"}
                </small>
                <small>
                  {validTarget(point) ? "GPS ✓" : "GPS —"}
                  {validationError != null ? ` · ${validationError.toFixed(1)}m` : ""}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.hint}>Upar `+ Point` se minimum 4 control points add karein.</div>
      )}

      {controlPoints.length ? (
        <div
          className={`${styles.calibrationSaveBar} ${
            calibrationDirty ? styles.calibrationSaveBarDirty : styles.calibrationSaveBarSaved
          }`}
        >
          <div>
            <b>{calibrationDirty ? "Calibration changes not saved" : "Calibration saved"}</b>
            <span>
              {calibrationDirty
                ? "Existing P1/P2/... ko edit karne ke baad yahin save karein. `+ Point` sirf naya control point banata hai."
                : "Current P1/P2/... server par saved hain. Save karne ke liye extra `+ Point` banana zaroori nahi hai."}
            </span>
          </div>
          <button
            type="button"
            className={styles.calibrationSaveButton}
            onClick={() => void onSaveCalibration()}
            disabled={disabled || !calibrationDirty}
          >
            <Save /> {calibrationDirty ? "Save Calibration" : "Saved"}
          </button>
        </div>
      ) : null}

      {diagnostics ? (
        <div
          className={`${styles.diagnostics} ${
            diagnostics.validationMeanErrorMeters != null &&
            diagnostics.validationMeanErrorMeters > 5
              ? styles.diagnosticsWarn
              : ""
          }`}
        >
          {diagnostics.validationMeanErrorMeters != null ? (
            <>
              <b>
                LOO validation mean {diagnostics.validationMeanErrorMeters.toFixed(2)} m
                {diagnostics.validationMaxErrorMeters != null
                  ? ` · max ${diagnostics.validationMaxErrorMeters.toFixed(2)} m`
                  : ""}
              </b>
              <span>
                {diagnostics.validationCoverage}/{diagnostics.pointCount} independent checks.
                {worstPointIndex >= 0 && diagnostics.validationMaxErrorMeters != null
                  ? ` Worst P${worstPointIndex + 1}: ${diagnostics.validationMaxErrorMeters.toFixed(2)} m.`
                  : ""}
                {" "}Highest residual point ko masterplan aur satellite dono par recheck karein.
              </span>
            </>
          ) : (
            <>
              <b>4-point exact-fit only</b>
              <span>
                Inhi 4 anchors ko fit karne se near-zero error expected hai; ye independent accuracy
                proof nahi hai. Kam se kam ek aur door ka landmark add karke Save Calibration karein.
              </span>
            </>
          )}
        </div>
      ) : null}

      <div className={styles.pairGrid}>
        <div className={styles.pane}>
          <div className={styles.paneTitle}>
            <MapIcon />
            <div>
              <b>1 · Masterplan source</b>
              <span>Tap se Source X/Y automatic 0..1 me set hoga.</span>
            </div>
          </div>
          <div className={styles.masterplanToolbar}>
            <div
              className={styles.masterplanToolGroup}
              role="group"
              aria-label="Masterplan interaction mode"
            >
              <button
                type="button"
                className={masterplanTool === "point" ? styles.masterplanToolActive : ""}
                onClick={() => setMasterplanTool("point")}
                disabled={disabled}
              >
                Place point
              </button>
              <button
                type="button"
                className={masterplanTool === "pan" ? styles.masterplanToolActive : ""}
                onClick={() => setMasterplanTool("pan")}
                disabled={disabled || masterplanZoom <= MASTERPLAN_ZOOM_MIN}
              >
                Pan
              </button>
            </div>
            <div
              className={styles.masterplanZoomGroup}
              role="group"
              aria-label="Masterplan zoom controls"
            >
              <button
                type="button"
                aria-label="Zoom masterplan out"
                onClick={() => setMasterplanZoomLevel(masterplanZoom - MASTERPLAN_ZOOM_STEP)}
                disabled={disabled || masterplanZoom <= MASTERPLAN_ZOOM_MIN}
              >
                −
              </button>
              <span>{Math.round(masterplanZoom * 100)}%</span>
              <button
                type="button"
                aria-label="Zoom masterplan in"
                onClick={() => setMasterplanZoomLevel(masterplanZoom + MASTERPLAN_ZOOM_STEP)}
                disabled={disabled || masterplanZoom >= MASTERPLAN_ZOOM_MAX}
              >
                +
              </button>
              <button type="button" onClick={resetMasterplanView} disabled={disabled}>
                Fit
              </button>
            </div>
          </div>
          <div className={styles.masterplanHint}>
            Exact corner ke liye zoom karein, `Place point` me tap/click karein. Zoom ke baad
            `Pan` se image move karein; marker ko drag karna zaroori nahi hai.
          </div>
          <div
            className={`${styles.imageStage} ${
              masterplanTool === "pan" ? styles.imageStagePan : styles.imageStagePoint
            }`}
            onWheel={zoomMasterplanWithWheel}
            onPointerDown={beginMasterplanPan}
            onPointerMove={moveMasterplanPan}
            onPointerUp={endMasterplanPan}
            onPointerCancel={endMasterplanPan}
          >
            {!masterplanReady && !masterplanError ? (
              <div className={styles.loading}>Masterplan load ho raha hai…</div>
            ) : null}
            {masterplanError ? (
              <div className={styles.error}>Geo Lab masterplan load nahi hui.</div>
            ) : null}
            <div
              className={styles.masterplanCanvas}
              style={{
                transform: `translate3d(${masterplanPan.x}px, ${masterplanPan.y}px, 0) scale(${masterplanZoom})`,
              }}
            >
              <img
                src={masterplanUrl}
                alt="Geo calibration masterplan"
                draggable={false}
                onLoad={() => {
                  setMasterplanReady(true);
                  setMasterplanError(false);
                }}
                onError={() => {
                  setMasterplanReady(false);
                  setMasterplanError(true);
                }}
                onPointerUp={updateActiveSource}
              />
              {masterplanReady
                ? controlPoints.map((point, index) =>
                    hasPlacedSource(point) ? (
                      <span
                        key={point.id}
                        className={`${styles.sourceMarker} ${
                          point.id === activeId ? styles.sourceMarkerActive : ""
                        }`}
                        style={{
                          left: `${point.source[0] * 100}%`,
                          top: `${point.source[1] * 100}%`,
                          transform: `translate(-50%, -50%) scale(${1 / masterplanZoom})`,
                        }}
                        aria-hidden="true"
                      >
                        <span className={styles.sourceMarkerLabel}>{index + 1}</span>
                      </span>
                    ) : null,
                  )
                : null}
            </div>
          </div>
        </div>

        <div className={styles.pane}>
          <div className={styles.paneTitle}>
            <Satellite />
            <div>
              <b>2 · Google Satellite target</b>
              <span>Map click se selected point ka WGS84 longitude/latitude set hoga.</span>
            </div>
          </div>

          {!config.mapsEnabled ? (
            <div className={styles.mapsSetup}>
              <b>Satellite key setup pending</b>
              <span>
                Upar Google Maps browser key paste karke Save Maps Key karein. Cloudflare
                `GOOGLE_MAPS_BROWSER_KEY` environment value fallback ke roop me supported rahegi.
                Manual longitude/latitude fields neeche bhi available hain.
              </span>
            </div>
          ) : !satelliteRequested ? (
            <div className={styles.mapsSetup}>
              <b>Google Satellite ready</b>
              <span>
                Safety ke liye Maps JavaScript API ab Geo Mapper open hote hi auto-load nahi hogi.
                Neeche button dabane par hi satellite runtime start hoga.
              </span>
              <button
                type="button"
                onClick={() => {
                  setMapError("");
                  setSatelliteRequested(true);
                }}
                disabled={disabled || keyBusy}
                style={{
                  justifySelf: "start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid #238a65",
                  borderRadius: 8,
                  background: "#176b4d",
                  color: "#fff",
                  padding: "9px 12px",
                  font: "inherit",
                  fontWeight: 800,
                  cursor: disabled || keyBusy ? "not-allowed" : "pointer",
                  opacity: disabled || keyBusy ? 0.45 : 1,
                }}
              >
                <Satellite style={{ width: 16, height: 16 }} /> Load Google Satellite
              </button>
            </div>
          ) : (
            <>
              <div className={styles.mapPreviewControls}>
                <label className={styles.mapPreviewToggle}>
                  <input
                    type="checkbox"
                    checked={showMasterplanOverlay}
                    onChange={(event) => setShowMasterplanOverlay(event.target.checked)}
                    disabled={disabled || !mapReady || !previewCalibration}
                  />
                  <span>Masterplan overlay preview</span>
                </label>
                <label className={styles.mapPreviewOpacity}>
                  <span>Opacity {Math.round(overlayOpacity * 100)}%</span>
                  <input
                    type="range"
                    min="0.15"
                    max="1"
                    step="0.05"
                    value={overlayOpacity}
                    onChange={(event) => setOverlayOpacity(Number(event.target.value))}
                    disabled={disabled || !showMasterplanOverlay}
                  />
                </label>
                <label className={styles.mapPreviewToggle}>
                  <input
                    type="checkbox"
                    checked={showPlotOverlay}
                    onChange={(event) => setShowPlotOverlay(event.target.checked)}
                    disabled={
                      disabled ||
                      !mapReady ||
                      calibrationDirty ||
                      previewPlotFeatures.length === 0
                    }
                  />
                  <span>Clickable plots ({previewPlotFeatures.length})</span>
                </label>
              </div>
              <div className={styles.mapPreviewHint}>
                Masterplan visual layer neeche rahegi; generated Geo plot polygons uske upar
                click capture karenge. Unsaved calibration me plots intentionally hide rahenge.
              </div>
              <div className={styles.centerBar}>
                <input
                  value={centerText}
                  onChange={(event) => setCenterText(event.target.value)}
                  placeholder="Project center: latitude, longitude"
                  inputMode="decimal"
                  disabled={disabled}
                />
                <button type="button" onClick={goToCenter} disabled={disabled || !mapReady}>
                  <LocateFixed /> Go
                </button>
                <button
                  type="button"
                  onClick={focusActiveTarget}
                  disabled={disabled || !mapReady || !activePoint}
                >
                  <Crosshair /> Point
                </button>
              </div>
              <div className={styles.mapStage}>
                <div
                  ref={mapNodeRef}
                  className={styles.googleMapCanvas}
                  aria-label="Google Satellite map"
                />
                {!mapReady && !mapError ? (
                  <div className={styles.loading}>Google Satellite load ho raha hai…</div>
                ) : null}
                {mapError ? <div className={styles.error}>{mapError}</div> : null}
              </div>
            </>
          )}
        </div>
      </div>

      <MasterplanMaskEditor
        sourceUrl={masterplanUrl}
        disabled={disabled}
        onPreviewChange={setMaskedMasterplanPreviewUrl}
        notify={notify}
      />

      <div className={styles.status}>
        <span>
          Source:{" "}
          {activePoint && hasPlacedSource(activePoint)
            ? `${activePoint.source[0].toFixed(6)}, ${activePoint.source[1].toFixed(6)}`
            : "—"}
        </span>
        <span>
          GPS:{" "}
          {activePoint && validTarget(activePoint)
            ? `${activePoint.target[1].toFixed(7)}, ${activePoint.target[0].toFixed(7)}`
            : "—"}
        </span>
      </div>
    </div>
  );
}
