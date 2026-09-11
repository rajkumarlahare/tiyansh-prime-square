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

type GoogleRoot = {
  maps: {
    Map: new (
      node: HTMLElement,
      options: Record<string, unknown>,
    ) => GoogleMapInstance;
    Circle: new (options: Record<string, unknown>) => GoogleCircle;
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

export default function GeoVisualCalibration({
  projectId,
  controlPoints,
  diagnostics,
  onChange,
  disabled,
  notify,
}: {
  projectId: string;
  controlPoints: ControlPoint[];
  diagnostics: CalibrationDiagnostics | null;
  onChange: Dispatch<SetStateAction<ControlPoint[]>>;
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
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const clickListenerRef = useRef<GoogleListener | null>(null);
  const circlesRef = useRef<GoogleCircle[]>([]);
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

  if (!config?.lab) return null;

  const activePoint = activeIndex >= 0 ? controlPoints[activeIndex] : null;
  const masterplanUrl =
    `/api/project-asset/masterplan?projectId=${encodeURIComponent(projectId)}` +
    "&preview=1&v=geo-visual-calibration";

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
        <div className={styles.active}>
          <Crosshair />
          {activePoint ? `Point ${activeIndex + 1}` : "No point"}
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
            const classes = [
              point.id === activeId ? styles.pointActive : "",
              point.id === diagnostics?.worstPointId ? styles.pointWorst : "",
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
