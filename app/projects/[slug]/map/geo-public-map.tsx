"use client";

import { useEffect, useRef, useState } from "react";
import { solveHomography, type MapperPoint } from "../../../mapper-geometry";
import styles from "./geo-public-map.module.css";

type PublicFeature = {
  id: string;
  name: string;
  linkedPlotId: string | null;
  source: string;
  layer: string;
  status: "available" | "booked" | "sold";
  sqft: number;
  sqm: number;
  sqyd: number;
  dimensions: string;
  road: string;
  path: [number, number][];
};

type PublicGeoData = {
  project: { id: string; name: string; slug: string };
  revision: number;
  maps: { enabled: boolean; apiKey: string | null };
  masterplanUrl: string;
  masterplanCorners: [number, number][];
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  features: PublicFeature[];
  counts: { total: number; available: number; booked: number; sold: number };
  error?: string;
};

type LatLng = { lat(): number; lng(): number };
type MapMouseEvent = { latLng?: LatLng | null };
type Listener = { remove?: () => void };
type MapInstance = {
  addListener(eventName: string, listener: () => void): Listener;
  fitBounds(bounds: unknown, padding?: number): void;
};
type Projection = {
  fromLatLngToDivPixel(latLng: LatLng): { x: number; y: number } | null;
};
type OverlayView = {
  onAdd?: () => void;
  draw?: () => void;
  onRemove?: () => void;
  setMap(map: MapInstance | null): void;
  getProjection(): Projection;
  getPanes(): { overlayLayer: HTMLElement };
};
type Polygon = {
  addListener(eventName: string, listener: (event: MapMouseEvent) => void): Listener;
  setMap(map: MapInstance | null): void;
};
type InfoWindow = {
  setContent(content: Node | string): void;
  setPosition(position: { lat: number; lng: number }): void;
  open(options: { map: MapInstance }): void;
  close(): void;
};
type GoogleRoot = {
  maps: {
    Map: new (node: HTMLElement, options: Record<string, unknown>) => MapInstance;
    LatLng: new (lat: number, lng: number) => LatLng;
    LatLngBounds: new (
      southWest?: { lat: number; lng: number },
      northEast?: { lat: number; lng: number },
    ) => unknown;
    OverlayView: new () => OverlayView;
    Polygon: new (options: Record<string, unknown>) => Polygon;
    InfoWindow: new (options?: Record<string, unknown>) => InfoWindow;
  };
};

type RekixoWindow = Window &
  typeof globalThis & {
    google?: GoogleRoot;
    __rekixoPublicGeoMapsReady?: () => void;
    gm_authFailure?: () => void;
  };

let mapsPromise: Promise<GoogleRoot> | null = null;

function win() {
  return window as RekixoWindow;
}

function loadGoogleMaps(apiKey: string) {
  if (win().google?.maps?.Map) return Promise.resolve(win().google!);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<GoogleRoot>((resolve, reject) => {
    const callbackName = "__rekixoPublicGeoMapsReady";
    win()[callbackName] = () => {
      if (win().google?.maps?.Map) resolve(win().google!);
      else reject(new Error("Google Maps JavaScript API load nahi hui"));
    };

    const existing = document.getElementById(
      "rekixo-public-google-maps-js",
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener(
        "load",
        () => {
          if (win().google?.maps?.Map) resolve(win().google!);
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "rekixo-public-google-maps-js";
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=weekly&loading=async&callback=${callbackName}`;
    script.onerror = () => {
      mapsPromise = null;
      reject(new Error("Google Satellite load fail hui"));
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

function cssProjectiveTransform(matrix: number[], width: number, height: number) {
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

function validatePublicGeoData(payload: PublicGeoData) {
  if (
    !payload ||
    !payload.project?.slug ||
    !payload.maps ||
    typeof payload.maps.enabled !== "boolean" ||
    !payload.bounds ||
    !Array.isArray(payload.masterplanCorners) ||
    payload.masterplanCorners.length !== 4 ||
    !Array.isArray(payload.features) ||
    !payload.counts
  ) {
    throw new Error("Satellite map data incomplete hai");
  }

  for (const value of [
    payload.bounds.minLng,
    payload.bounds.minLat,
    payload.bounds.maxLng,
    payload.bounds.maxLat,
  ]) {
    if (!Number.isFinite(value))
      throw new Error("Satellite map bounds invalid hain");
  }

  return payload;
}

function plotStyle(status: string) {
  if (status === "sold") return { fillColor: "#ef334e", strokeColor: "#ff6b7f" };
  if (status === "booked") return { fillColor: "#f4b51f", strokeColor: "#ffd45f" };
  return { fillColor: "#18b968", strokeColor: "#63e6ad" };
}

function addMasterplanOverlay(
  google: GoogleRoot,
  map: MapInstance,
  url: string,
  corners: [number, number][],
) {
  const overlay = new google.maps.OverlayView();
  let host: HTMLDivElement | null = null;
  let image: HTMLImageElement | null = null;

  const draw = () => {
    if (!host || !image || !image.naturalWidth || !image.naturalHeight) return;
    const projection = overlay.getProjection();
    const target = corners.map(([lng, lat]) =>
      projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng)),
    );
    if (target.length !== 4 || target.some((point) => !point)) return;

    const source: MapperPoint[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const matrix = solveHomography(
      source.map((sourcePoint, index) => ({
        source: sourcePoint,
        target: [target[index]!.x, target[index]!.y] as MapperPoint,
      })),
    );
    host.style.transform = cssProjectiveTransform(
      matrix,
      image.naturalWidth,
      image.naturalHeight,
    );
    host.style.visibility = "visible";
  };

  overlay.onAdd = () => {
    host = document.createElement("div");
    host.className = styles.masterplanOverlay;
    image = document.createElement("img");
    image.src = url;
    image.alt = "Project masterplan";
    image.draggable = false;
    image.decoding = "async";
    image.onload = draw;
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
  return overlay;
}

function plotInfoCard(feature: PublicFeature) {
  const card = document.createElement("div");
  card.className = styles.infoCard;
  const title = document.createElement("strong");
  title.textContent = feature.linkedPlotId
    ? `Plot ${feature.linkedPlotId}`
    : feature.name;
  card.appendChild(title);

  const status = document.createElement("span");
  status.textContent = `Status: ${feature.status[0].toUpperCase()}${feature.status.slice(1)}`;
  card.appendChild(status);

  if (feature.sqft > 0) {
    const area = document.createElement("span");
    area.textContent = `Area: ${feature.sqft.toLocaleString("en-IN")} Sq.Ft`;
    card.appendChild(area);
  }
  if (feature.dimensions) {
    const dimensions = document.createElement("span");
    dimensions.textContent = `Dimensions: ${feature.dimensions}`;
    card.appendChild(dimensions);
  }
  if (feature.road) {
    const road = document.createElement("span");
    road.textContent = `Road: ${feature.road}`;
    card.appendChild(road);
  }
  return card;
}

export default function GeoPublicMap({
  projectName,
  projectSlug,
}: {
  projectName: string;
  projectSlug: string;
}) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<PublicGeoData | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/public-geo?projectSlug=${encodeURIComponent(projectSlug)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as PublicGeoData;
        if (!response.ok) throw new Error(payload.error || "Satellite map load nahi hua");
        return validatePublicGeoData(payload);
      })
      .then((payload) => {
        setError("");
        setMapReady(false);
        setData(payload);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Satellite map load nahi hua");
      });
    return () => controller.abort();
  }, [projectSlug]);

  useEffect(() => {
    if (!data || !mapNodeRef.current) return;
    if (!data.maps.enabled || !data.maps.apiKey) {
      setError("Google Satellite key public website ke liye configured nahi hai");
      return;
    }

    let cancelled = false;
    let overlay: OverlayView | null = null;
    let polygons: Polygon[] = [];
    let info: InfoWindow | null = null;
    let tilesListener: Listener | null = null;
    let tileTimer: number | null = null;
    const previousAuthFailure = win().gm_authFailure;

    setMapReady(false);
    setError("");
    win().gm_authFailure = () => {
      if (cancelled) return;
      setMapReady(false);
      setError("Google Maps API key/referrer authorization fail hui");
    };

    loadGoogleMaps(data.maps.apiKey)
      .then((google) => {
        if (cancelled || !mapNodeRef.current) return;
        const map = new google.maps.Map(mapNodeRef.current, {
          mapTypeId: "satellite",
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        const bounds = new google.maps.LatLngBounds(
          { lat: data.bounds.minLat, lng: data.bounds.minLng },
          { lat: data.bounds.maxLat, lng: data.bounds.maxLng },
        );

        tilesListener = map.addListener("tilesloaded", () => {
          if (cancelled) return;
          if (tileTimer !== null) {
            window.clearTimeout(tileTimer);
            tileTimer = null;
          }
          setError("");
          setMapReady(true);
        });
        tileTimer = window.setTimeout(() => {
          if (cancelled) return;
          setMapReady(false);
          setError(
            "Satellite tiles 20 sec me load nahi hue. Maps key/referrer aur network check karein.",
          );
        }, 20_000);

        map.fitBounds(bounds, 34);

        overlay = addMasterplanOverlay(
          google,
          map,
          data.masterplanUrl,
          data.masterplanCorners,
        );

        info = new google.maps.InfoWindow();
        polygons = data.features.map((feature) => {
          const style = plotStyle(feature.status);
          const polygon = new google.maps.Polygon({
            map,
            paths: feature.path.map(([lng, lat]) => ({ lat, lng })),
            clickable: Boolean(feature.linkedPlotId),
            fillColor: style.fillColor,
            fillOpacity: feature.linkedPlotId ? 0.09 : 0.03,
            strokeColor: style.strokeColor,
            strokeOpacity: feature.linkedPlotId ? 0.95 : 0.55,
            strokeWeight: feature.linkedPlotId ? 1.6 : 1.2,
            zIndex: feature.linkedPlotId ? 30 : 20,
          });
          if (feature.linkedPlotId) {
            polygon.addListener("click", (event) => {
              info?.setContent(plotInfoCard(feature));
              const latLng = event.latLng;
              const fallback = feature.path[0];
              if (latLng) {
                info?.setPosition({ lat: latLng.lat(), lng: latLng.lng() });
              } else if (fallback) {
                info?.setPosition({ lat: fallback[1], lng: fallback[0] });
              }
              info?.open({ map });
            });
          }
          return polygon;
        });
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Google Satellite load fail hui");
      });

    return () => {
      cancelled = true;
      if (tileTimer !== null) window.clearTimeout(tileTimer);
      tilesListener?.remove?.();
      overlay?.setMap(null);
      polygons.forEach((polygon) => polygon.setMap(null));
      info?.close();
      win().gm_authFailure = previousAuthFailure;
    };
  }, [data]);

  return (
    <main className={styles.shell}>
      <div ref={mapNodeRef} className={styles.map} aria-label={`${projectName} satellite map`} />

      <header className={styles.header}>
        <div>
          <small>LIVE SATELLITE MASTERPLAN</small>
          <h1>{projectName}</h1>
          <p>{data ? `Geo revision ${data.revision}` : "Loading…"}</p>
        </div>
        <a href={`/projects/${encodeURIComponent(projectSlug)}`}>Project site</a>
      </header>

      {data ? (
        <section className={styles.legend} aria-label="Plot availability">
          <span><i className={styles.available} /> Available <b>{data.counts.available}</b></span>
          <span><i className={styles.booked} /> Booked <b>{data.counts.booked}</b></span>
          <span><i className={styles.sold} /> Sold <b>{data.counts.sold}</b></span>
          <span>Total <b>{data.counts.total}</b></span>
        </section>
      ) : null}

      {!error && (!data || !mapReady) ? (
        <div className={styles.loading}>
          {data
            ? "Google Satellite tiles load ho rahe hain…"
            : "Satellite map data load ho raha hai…"}
        </div>
      ) : null}
      {error ? (
        <div className={styles.error}>
          <b>Map load nahi hua</b>
          <span>{error}</span>
        </div>
      ) : null}
    </main>
  );
}
