"use client";

import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Crosshair, LocateFixed, Map, Satellite } from "lucide-react";
import styles from "./geo-visual-calibration.module.css";

type ControlPoint = {
  id: string;
  source: [number, number];
  target: [number, number];
  label?: string;
};

type MapConfig = {
  lab: boolean;
  mapsEnabled: boolean;
  apiKey?: string | null;
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

export default function GeoVisualCalibration({
  projectId,
  controlPoints,
  onChange,
  disabled,
  notify,
}: {
  projectId: string;
  controlPoints: ControlPoint[];
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
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMapInstance | null>(null);
  const clickListenerRef = useRef<GoogleListener | null>(null);
  const circlesRef = useRef<GoogleCircle[]>([]);
  const activeIdRef = useRef("");

  const activeIndex = useMemo(
    () => controlPoints.findIndex((point) => point.id === activeId),
    [controlPoints, activeId],
  );

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!controlPoints.length) {
      setActiveId("");
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
    if (!config?.lab || !config.mapsEnabled || !config.apiKey || !mapNodeRef.current) return;
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
  }, [config?.lab, config?.mapsEnabled, config?.apiKey, projectId, notify, onChange]);

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
            }
          : item,
      ),
    );
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

      {controlPoints.length ? (
        <div className={styles.pointTabs}>
          {controlPoints.map((point, index) => (
            <button
              type="button"
              key={point.id}
              className={point.id === activeId ? styles.pointActive : ""}
              onClick={() => setActiveId(point.id)}
              disabled={disabled}
            >
              P{index + 1}
              <small>
                {validTarget(point) ? "GPS ✓" : "GPS —"}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.hint}>Upar `+ Point` se minimum 4 control points add karein.</div>
      )}

      <div className={styles.pairGrid}>
        <div className={styles.pane}>
          <div className={styles.paneTitle}>
            <Map />
            <div>
              <b>1 · Masterplan source</b>
              <span>Tap se Source X/Y automatic 0..1 me set hoga.</span>
            </div>
          </div>
          <div className={styles.imageStage}>
            {!masterplanReady && !masterplanError ? (
              <div className={styles.loading}>Masterplan load ho raha hai…</div>
            ) : null}
            {masterplanError ? (
              <div className={styles.error}>Geo Lab masterplan load nahi hui.</div>
            ) : null}
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
              ? controlPoints.map((point, index) => (
                  <button
                    type="button"
                    key={point.id}
                    className={`${styles.sourceMarker} ${
                      point.id === activeId ? styles.sourceMarkerActive : ""
                    }`}
                    style={{
                      left: `${point.source[0] * 100}%`,
                      top: `${point.source[1] * 100}%`,
                    }}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveId(point.id);
                    }}
                    aria-label={`Select control point ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                ))
              : null}
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
                Super Admin Worker me `GOOGLE_MAPS_BROWSER_KEY` configure karein. Manual
                longitude/latitude fields neeche fallback ke roop me available rahenge.
              </span>
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
              <div className={styles.mapStage} ref={mapNodeRef}>
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
          {activePoint
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
