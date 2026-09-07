"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Hand,
  ImagePlus,
  Maximize2,
  MousePointer2,
  Pencil,
  RotateCcw,
  Save,
  Target,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  applyHomography,
  bestCadLabel,
  cadAreaErrorRatio,
  calibrationError,
  cleanPlotId,
  estimateCadAreaScale,
  nextPlotId,
  polygonCenter,
  snapPoint,
  solveHomography,
  transformedCandidate,
  validNormalizedPolygon,
  type CadGeometry,
  type HomographyPair,
  type MapperPoint,
} from "./mapper-geometry";

type Plot = {
  id: string;
  sqft: number;
  sqm: number;
  sqyd: number;
  dimensions: string;
  road: string;
  status: string;
  notes?: string;
  featured?: boolean;
  polygon?: string;
};

type MapperSettings = {
  masterplanName?: string;
  sourcePdfName?: string;
  sourceCadName?: string;
  plotSheetName?: string;
  mapWidth?: string;
  mapHeight?: string;
  masterplanOriginalWidth?: string;
  masterplanOriginalHeight?: string;
  masterplanOriginalName?: string;
  cadCandidateCount?: string;
  cadParseError?: string;
  homography?: string;
  calibrationPairs?: string;
  calibrationError?: string;
  cadMatchedCount?: string;
  cadReviewCount?: string;
};

type AutoMatch = {
  plot: Plot;
  candidateKey: string;
  points: MapperPoint[];
  candidate: CadGeometry["candidates"][number];
  areaErrorRatio: number | null;
};

type GesturePoint = { x: number; y: number };

type PanGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
};

type PinchGesture = {
  startDistance: number;
  startZoom: number;
  lastCenterX: number;
  lastCenterY: number;
};

type ZoomAnchor = {
  clientX: number;
  clientY: number;
  visualX: number;
  visualY: number;
};

type PendingPinchFrame = {
  zoom: number;
  centerX: number;
  centerY: number;
  panX: number;
  panY: number;
};

const COMPLETED_PROJECT_ID = "tiyansh-prime-square";
const MAX_MAPPING_DIMENSION = 6144;
const MAX_MAPPING_PIXELS = 24_000_000;
const TARGET_MAPPING_BYTES = 12 * 1024 * 1024;
const MAX_PUBLIC_DIMENSION = 2400;
const MAX_PUBLIC_PIXELS = 5_000_000;
const TARGET_PUBLIC_BYTES = 2_500_000;
const MAX_ORIGINAL_MASTERPLAN_BYTES = 40 * 1024 * 1024;

async function apiResult(response: Response) {
  const raw = await response.text();
  let result: Record<string, unknown> = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    // Cloudflare can return plain text errors.
  }
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : raw.trim() || `Request failed (${response.status})`,
    );
  }
  return result;
}

async function prepareMasterplan(file: File) {
  if (file.size > MAX_ORIGINAL_MASTERPLAN_BYTES) {
    throw new Error("Masterplan 40 MB se chhoti rakhein");
  }
  const bitmap = await createImageBitmap(file);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const mappingScale = Math.min(
    1,
    MAX_MAPPING_DIMENSION / Math.max(bitmap.width, bitmap.height),
    Math.sqrt(MAX_MAPPING_PIXELS / (bitmap.width * bitmap.height)),
  );
  const width = Math.max(1, Math.round(bitmap.width * mappingScale));
  const height = Math.max(1, Math.round(bitmap.height * mappingScale));

  const renderWebp = async (
    targetWidth: number,
    targetHeight: number,
    targetBytes: number,
    qualities: number[],
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Masterplan process nahi ho payi");
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const encode = (quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    let blob: Blob | null = null;
    for (const quality of qualities) {
      blob = await encode(quality);
      if (blob && blob.size <= targetBytes) break;
    }
    if (!blob) throw new Error("Masterplan image encode nahi hui");
    return blob;
  };

  // Keep the exact project aspect ratio while preserving as much source detail as practical.
  let mappingFile = file;
  if (mappingScale < 1 || file.size > TARGET_MAPPING_BYTES) {
    const blob = await renderWebp(width, height, TARGET_MAPPING_BYTES, [0.92, 0.86, 0.8, 0.72, 0.64]);
    mappingFile = new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "masterplan"}.mapping.webp`,
      { type: "image/webp" },
    );
  }

  // Public/mobile traffic gets a separate lighter derivative. Geometry stays
  // normalized, so both image resolutions share exactly the same polygons.
  const publicScale = Math.min(
    1,
    MAX_PUBLIC_DIMENSION / Math.max(bitmap.width, bitmap.height),
    Math.sqrt(MAX_PUBLIC_PIXELS / (bitmap.width * bitmap.height)),
  );
  const publicWidth = Math.max(1, Math.round(bitmap.width * publicScale));
  const publicHeight = Math.max(1, Math.round(bitmap.height * publicScale));
  let publicFile = file;
  if (publicScale < 1 || file.size > TARGET_PUBLIC_BYTES) {
    const blob = await renderWebp(
      publicWidth,
      publicHeight,
      TARGET_PUBLIC_BYTES,
      [0.86, 0.78, 0.7, 0.62, 0.54],
    );
    publicFile = new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "masterplan"}.public.webp`,
      { type: "image/webp" },
    );
  }
  bitmap.close();

  return {
    mappingFile,
    publicFile,
    originalFile: file,
    width,
    height,
    originalWidth,
    originalHeight,
  };
}

function plotSort(a: Plot, b: Plot) {
  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" });
}

function parsePolygon(plot: Plot) {
  try {
    const points = JSON.parse(plot.polygon || "[]") as MapperPoint[];
    return Array.isArray(points) && points.length >= 3 ? points : [];
  } catch {
    return [];
  }
}

function settingsNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function segmentDirection(a: MapperPoint, b: MapperPoint, c: MapperPoint) {
  return (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]);
}

function segmentsCross(a: MapperPoint, b: MapperPoint, c: MapperPoint, d: MapperPoint) {
  const abC = segmentDirection(a, b, c);
  const abD = segmentDirection(a, b, d);
  const cdA = segmentDirection(c, d, a);
  const cdB = segmentDirection(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function polygonSelfIntersects(points: MapperPoint[]) {
  if (points.length < 4) return false;
  for (let a = 0; a < points.length; a += 1) {
    const aNext = (a + 1) % points.length;
    for (let b = a + 1; b < points.length; b += 1) {
      const bNext = (b + 1) % points.length;
      if (a === b || aNext === b || bNext === a) continue;
      if (a === 0 && bNext === 0) continue;
      if (segmentsCross(points[a], points[aNext], points[b], points[bNext])) return true;
    }
  }
  return false;
}

function mappingDraftKey(projectId: string, plotId: string) {
  return `rekixo:mapper-draft:${projectId}:${cleanPlotId(plotId)}`;
}

export default function PlotMapper({
  notify,
  projectId,
}: {
  notify: (message: string) => void;
  projectId: string;
}) {
  const completedProject = projectId === COMPLETED_PROJECT_ID;
  const assetUrl = (kind: string) =>
    completedProject && kind === "masterplan"
      ? "/project/masterplan.jpg"
      : `/api/project-asset/${kind}?projectId=${encodeURIComponent(projectId)}`;

  const [plots, setPlots] = useState<Plot[]>([]);
  const [settings, setSettings] = useState<MapperSettings>({});
  const [cadGeometry, setCadGeometry] = useState<CadGeometry | null>(null);
  const [imageUrl, setImageUrl] = useState(() => assetUrl("masterplan"));
  const [imageReady, setImageReady] = useState(false);
  // Actual decoded image dimensions are the final display truth. This prevents
  // metadata/CSS mismatch from ever stretching the masterplan.
  const [naturalImageSize, setNaturalImageSize] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastVerifiedId, setLastVerifiedId] = useState("");
  const [zoom, setZoom] = useState(1);
  // 0/1/2/3 = 0°/90°/180°/270° clockwise. Rotation is mapping-view only:
  // persistent plot geometry always remains in the original masterplan coordinate space.
  const [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0);
  const [toolMode, setToolMode] = useState<"pan" | "select">("pan");

  // Primary precision image mapper.
  const [plotId, setPlotId] = useState("1");
  const [dimensions, setDimensions] = useState("");
  const [sqft, setSqft] = useState("");
  const [road, setRoad] = useState("");
  const [points, setPoints] = useState<MapperPoint[]>([]);
  const [shape, setShape] = useState<"quad" | "polygon">("quad");
  const [manualPhase, setManualPhase] = useState<"select" | "details">("select");
  const [editingId, setEditingId] = useState("");
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [loupePoint, setLoupePoint] = useState<MapperPoint | null>(null);

  // CAD calibration and automatic geometry matching.
  const [calibrationPairs, setCalibrationPairs] = useState<HomographyPair[]>([]);
  const [pendingCadPoint, setPendingCadPoint] = useState<MapperPoint | null>(null);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [showCadOverlay, setShowCadOverlay] = useState(true);
  const [excludedAutoIds, setExcludedAutoIds] = useState<Set<string>>(() => new Set());

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imageWrapRef = useRef<HTMLDivElement | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const activeGesturePointersRef = useRef<Map<number, GesturePoint>>(new Map());
  const panGestureRef = useRef<PanGesture | null>(null);
  const pinchGestureRef = useRef<PinchGesture | null>(null);
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null);
  const suppressTapUntilRef = useRef(0);
  const zoomRef = useRef(1);
  // Pointer events can arrive much faster than the screen can paint. Keep raw
  // coordinates in refs and mutate scroll/zoom at most once per animation frame.
  // This removes the Android/Chrome "kapkapi" caused by layout + scroll work on
  // every pointermove while preserving the exact latest finger position.
  const gestureFrameRef = useRef<number | null>(null);
  const pendingPanRef = useRef({ x: 0, y: 0 });
  const pendingPinchRef = useRef<PendingPinchFrame | null>(null);


  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const anchor = zoomAnchorRef.current;
    if (!anchor) return;
    zoomAnchorRef.current = null;
    const canvas = canvasRef.current;
    const wrap = imageWrapRef.current;
    if (!canvas || !wrap) return;
    const box = wrap.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const anchoredClientX = box.left + anchor.visualX * box.width;
    const anchoredClientY = box.top + anchor.visualY * box.height;
    canvas.scrollLeft += anchoredClientX - anchor.clientX;
    canvas.scrollTop += anchoredClientY - anchor.clientY;
  }, [zoom]);

  async function reload() {
    const response = await fetch(`/api/super-mapper?projectId=${encodeURIComponent(projectId)}`, {
      cache: "no-store",
    });
    const data = await apiResult(response);
    const nextPlots = (data.plots || []) as Plot[];
    const nextSettings = (data.settings || {}) as MapperSettings;
    setPlots(nextPlots);
    setSettings(nextSettings);
    setCadGeometry((data.cadGeometry || null) as CadGeometry | null);
    setImageUrl(assetUrl("masterplan"));
    setImageReady(false);
    setNaturalImageSize(null);
    const firstUnmapped = [...nextPlots].sort(plotSort).find((plot) => !plot.polygon);
    if (firstUnmapped) loadPlotDetails(firstUnmapped, false);
    else if (nextPlots.length) setPlotId(nextPlotId([...nextPlots].sort(plotSort).at(-1)?.id || "1"));
    else setPlotId("1");
    setExcludedAutoIds(new Set());
    const savedPairs = String(nextSettings.calibrationPairs || "");
    if (savedPairs) {
      try {
        const parsed = JSON.parse(savedPairs) as HomographyPair[];
        if (
          Array.isArray(parsed) &&
          parsed.length >= 4 &&
          parsed.every(
            (pair) =>
              Array.isArray(pair?.source) &&
              pair.source.length === 2 &&
              Array.isArray(pair?.target) &&
              pair.target.length === 2,
          )
        ) {
          setCalibrationPairs(parsed.slice(0, 12));
          setCalibrationMode(false);
        } else setCalibrationPairs([]);
      } catch {
        setCalibrationPairs([]);
      }
    } else setCalibrationPairs([]);
  }

  useEffect(() => {
    resetGestureFrameQueue();
    activeGesturePointersRef.current.clear();
    panGestureRef.current = null;
    pinchGestureRef.current = null;
    zoomAnchorRef.current = null;
    tapStartRef.current = null;
    suppressTapUntilRef.current = 0;
    zoomRef.current = 1;
    setZoom(1);
    reload().catch(() => notify("Project mapper data load नहीं हुआ"));
    // Restore this device's preferred mapping orientation for the project.
    try {
      const saved = Number(window.localStorage.getItem(`rekixo:mapper-rotation:${projectId}`));
      if (saved === 0 || saved === 1 || saved === 2 || saved === 3)
        setRotation(saved as 0 | 1 | 2 | 3);
      else setRotation(0);
    } catch {
      setRotation(0);
    }
    // projectId remounts the component in Super Admin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (completedProject || !plotId || editingId || points.length) return;
    try {
      const raw = window.localStorage.getItem(mappingDraftKey(projectId, plotId));
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        points?: MapperPoint[];
        shape?: "quad" | "polygon";
        manualPhase?: "select" | "details";
      };
      const restored =
        Array.isArray(draft.points) &&
        draft.points.length > 0 &&
        draft.points.length <= 80 &&
        draft.points.every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            Number.isFinite(point[0]) &&
            Number.isFinite(point[1]) &&
            point[0] >= 0 &&
            point[0] <= 1 &&
            point[1] >= 0 &&
            point[1] <= 1,
        );
      if (!restored) return;
      setPoints(draft.points as MapperPoint[]);
      setShape(draft.shape === "polygon" ? "polygon" : "quad");
      setManualPhase(draft.manualPhase === "details" && draft.points!.length >= 3 ? "details" : "select");
      setToolMode("select");
      notify(`Plot ${plotId} का unsaved shape draft restore हुआ`);
    } catch {
      // A broken local draft must never block the project mapper.
    }
    // Restore is intentionally scoped to project/plot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, plotId]);

  useEffect(() => {
    if (completedProject || !plotId || !points.length) return;
    try {
      window.localStorage.setItem(
        mappingDraftKey(projectId, plotId),
        JSON.stringify({ points, shape, manualPhase }),
      );
    } catch {
      // Storage quota/private mode should not block mapping.
    }
  }, [completedProject, manualPhase, plotId, points, projectId, shape]);

  const mappedPlots = useMemo(() => plots.filter((plot) => parsePolygon(plot).length >= 3), [plots]);
  const inventoryPlots = useMemo(() => [...plots].sort(plotSort), [plots]);
  const unmappedPlots = useMemo(
    () => inventoryPlots.filter((plot) => parsePolygon(plot).length < 3),
    [inventoryPlots],
  );
  const mappedPolygons = useMemo(
    () => mappedPlots.filter((plot) => plot.id !== editingId).map(parsePolygon),
    [mappedPlots, editingId],
  );
  const mapWidth = settingsNumber(settings.mapWidth, completedProject ? 1200 : 2048);
  const mapHeight = settingsNumber(settings.mapHeight, completedProject ? 2133 : 1152);
  const hasMasterplan = completedProject || Boolean(settings.masterplanName);
  const hasCad = Boolean(settings.sourceCadName);
  const hasPlotSheet = Boolean(settings.plotSheetName) || plots.length > 0;
  const hasPdf = Boolean(settings.sourcePdfName);

  const savedMatrix = useMemo(() => {
    try {
      const parsed = JSON.parse(settings.homography || "[]") as number[];
      return Array.isArray(parsed) && parsed.length === 9 ? parsed : null;
    } catch {
      return null;
    }
  }, [settings.homography]);

  const liveMatrix = useMemo(() => {
    if (calibrationPairs.length >= 4) {
      try {
        return solveHomography(calibrationPairs);
      } catch {
        return null;
      }
    }
    return savedMatrix;
  }, [calibrationPairs, savedMatrix]);

  const cadTransformed = useMemo(() => {
    if (!cadGeometry || !liveMatrix) return [];
    return cadGeometry.candidates
      .map((candidate) => {
        try {
          return { candidate, points: transformedCandidate(candidate, liveMatrix) };
        } catch {
          return null;
        }
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          Boolean(item && validNormalizedPolygon(item.points)),
      );
  }, [cadGeometry, liveMatrix]);

  const labelMatches = useMemo(() => {
    if (!cadGeometry || !liveMatrix || !inventoryPlots.length) return [];
    const inventoryById = new Map(inventoryPlots.map((plot) => [cleanPlotId(plot.id), plot]));
    const ids = new Set(inventoryById.keys());
    const used = new Set<string>();
    const matches: Omit<AutoMatch, "areaErrorRatio">[] = [];
    for (const candidate of cadGeometry.candidates) {
      const id = bestCadLabel(candidate, cadGeometry.labels, ids);
      if (!id || used.has(id)) continue;
      const plot = inventoryById.get(id);
      if (!plot) continue;
      let transformed: MapperPoint[];
      try {
        transformed = transformedCandidate(candidate, liveMatrix);
      } catch {
        continue;
      }
      if (!validNormalizedPolygon(transformed)) continue;
      used.add(id);
      matches.push({ plot, candidateKey: candidate.key, points: transformed, candidate });
    }
    return matches.sort((a, b) => plotSort(a.plot, b.plot));
  }, [cadGeometry, inventoryPlots, liveMatrix]);

  const cadAreaScale = useMemo(
    () =>
      estimateCadAreaScale(
        labelMatches.map((match) => ({ candidate: match.candidate, sqm: Number(match.plot.sqm) })),
      ),
    [labelMatches],
  );

  const scoredLabelMatches = useMemo<AutoMatch[]>(
    () =>
      labelMatches.map((match) => ({
        ...match,
        areaErrorRatio: cadAreaErrorRatio(match.candidate, Number(match.plot.sqm), cadAreaScale),
      })),
    [labelMatches, cadAreaScale],
  );

  // Exact unique ID + a CAD area consistent with the project-wide unit scale is
  // Auto-ready. Large area disagreement is never bulk-published silently.
  const autoMatches = useMemo(
    () =>
      scoredLabelMatches.filter(
        (match) => match.areaErrorRatio == null || match.areaErrorRatio <= 0.22,
      ),
    [scoredLabelMatches],
  );
  const areaReviewMatches = useMemo(
    () => scoredLabelMatches.filter((match) => (match.areaErrorRatio ?? 0) > 0.22),
    [scoredLabelMatches],
  );
  const acceptedAutoMatches = useMemo(
    () => autoMatches.filter((match) => !excludedAutoIds.has(match.plot.id)),
    [autoMatches, excludedAutoIds],
  );
  const excludedAutoMatches = useMemo(
    () => autoMatches.filter((match) => excludedAutoIds.has(match.plot.id)),
    [autoMatches, excludedAutoIds],
  );
  const autoMatchIds = useMemo(
    () => new Set(acceptedAutoMatches.map((match) => match.plot.id)),
    [acceptedAutoMatches],
  );
  const areaReviewIds = useMemo(
    () => new Set(areaReviewMatches.map((match) => match.plot.id)),
    [areaReviewMatches],
  );
  const reviewPlots = useMemo(
    () => inventoryPlots.filter((plot) => !plot.polygon && !autoMatchIds.has(plot.id)),
    [inventoryPlots, autoMatchIds],
  );

  function loadPlotDetails(plot: Plot, editBoundary: boolean) {
    setPlotId(plot.id);
    setDimensions(plot.dimensions || "");
    setSqft(plot.sqft ? String(plot.sqft) : "");
    setRoad(plot.road || "");
    if (editBoundary && plot.polygon) {
      const polygon = parsePolygon(plot);
      setPoints(polygon);
      setEditingId(plot.id);
      setShape(polygon.length === 4 ? "quad" : "polygon");
      setManualPhase("details");
      setToolMode("select");
      canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      setPoints([]);
      setEditingId("");
      setManualPhase("select");
      setToolMode("pan");
    }
  }

  function selectNextPlot(afterId = "") {
    const ordered = [...plots].sort(plotSort);
    const remaining = ordered.filter((plot) => !plot.polygon && plot.id !== afterId);
    const currentIndex = ordered.findIndex((plot) => plot.id === afterId);
    const next =
      remaining.find((plot) => ordered.indexOf(plot) > currentIndex) || remaining[0] || null;
    if (next) loadPlotDetails(next, false);
    else {
      setPoints([]);
      setEditingId("");
      setManualPhase("select");
      setPlotId(nextPlotId(afterId || ordered.at(-1)?.id || "1"));
      setDimensions("");
      setSqft("");
      setRoad("");
    }
  }

  function selectSiblingPlot(offset: -1 | 1) {
    if (!inventoryPlots.length) return;
    const currentIndex = Math.max(0, inventoryPlots.findIndex((plot) => plot.id === plotId));
    const nextIndex = Math.max(0, Math.min(inventoryPlots.length - 1, currentIndex + offset));
    const target = inventoryPlots[nextIndex];
    if (target) loadPlotDetails(target, Boolean(target.polygon));
  }

  function toggleMapperFullscreen() {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      const exit = document.exitFullscreen?.();
      if (exit) exit.catch(() => {});
      return;
    }
    const request = canvasRef.current?.requestFullscreen?.();
    if (request) request.catch(() => {});
  }

  function enableSelectMode() {
    setToolMode("select");
    setCalibrationMode(false);
    // On a real touch device, SELECT is also the mapping focus action.
    // Fullscreen removes Chrome browser chrome/menus from the tapping area.
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(any-pointer: coarse)").matches &&
      typeof document !== "undefined" &&
      !document.fullscreenElement
    ) {
      const request = canvasRef.current?.requestFullscreen?.();
      if (request) request.catch(() => {});
    }
  }

  function clearCurrentPoints() {
    setPoints([]);
    setManualPhase("select");
    setEditingId("");
    setToolMode("select");
    try {
      window.localStorage.removeItem(mappingDraftKey(projectId, plotId));
    } catch {
      // Ignore local storage failures.
    }
  }

  function clearCurrentSelection() {
    const saved = plots.find(
      (plot) => plot.id === plotId && parsePolygon(plot).length >= 3,
    );
    if (saved) {
      // "Clear" on an already-mapped plot must clear the persisted clickable
      // boundary, not just hide its edit handles locally.
      void remove(saved);
      return;
    }
    clearCurrentPoints();
  }

  function undoPoint() {
    setPoints((current) => current.slice(0, -1));
    setManualPhase("select");
    setToolMode("select");
  }

  function clonePreviousShape() {
    const currentIndex = inventoryPlots.findIndex((plot) => plot.id === plotId);
    const before = currentIndex > 0 ? inventoryPlots.slice(0, currentIndex).reverse() : [];
    const source = before.find((plot) => parsePolygon(plot).length >= 3) ||
      [...inventoryPlots].reverse().find((plot) => plot.id !== plotId && parsePolygon(plot).length >= 3);
    if (!source) return notify("Clone करने के लिए पहले कोई mapped plot चाहिए");
    const polygon = parsePolygon(source);
    setPoints(polygon.map(([x, y]) => [x, y] as MapperPoint));
    setShape(polygon.length === 4 ? "quad" : "polygon");
    setManualPhase("details");
    setEditingId("");
    setToolMode("select");
    canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    notify(`Plot ${source.id} shape clone हुआ — handles drag करके ${plotId} पर fit करें`);
  }

  function downloadPlotSheetTemplate() {
    const text = [
      "Plot No,Sqft,Sqm,Dimensions,Facing,Notes",
      "1,1162.08,108,12.00 x 9.00 m,East face,",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "rekixo-plot-sheet-template.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function upload(file: File, kind: "masterplan" | "sourcePdf" | "sourceCad" | "plotSheet") {
    if (completedProject && kind !== "sourcePdf") {
      notify("Tiyansh completed project locked है");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.append("projectId", projectId);
      data.append("kind", kind);
      if (kind === "masterplan") {
        const prepared = await prepareMasterplan(file);
        data.append("file", prepared.mappingFile);
        data.append("originalFile", prepared.originalFile);
        data.append("publicFile", prepared.publicFile);
        data.append("mapWidth", String(prepared.width));
        data.append("mapHeight", String(prepared.height));
        data.append("originalWidth", String(prepared.originalWidth));
        data.append("originalHeight", String(prepared.originalHeight));
      } else data.append("file", file);

      const response = await fetch("/api/super-mapper", { method: "POST", body: data });
      const result = await apiResult(response);
      if (kind === "sourceCad" && result.cadError) {
        notify(`CAD save हुआ, auto-detect review चाहिए: ${String(result.cadError)}`);
      } else if (kind === "sourceCad") {
        notify(`${(result.cadGeometry as CadGeometry | undefined)?.candidates.length || 0} CAD boundaries मिलीं`);
      } else if (kind === "plotSheet") {
        notify(`${Number(result.count || 0)} plot records import हुए`);
      } else if (kind === "masterplan") {
        notify("Masterplan native aspect ratio में ready है");
      } else notify("Technical PDF reference save हो गया");
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Upload नहीं हुआ");
    } finally {
      setBusy(false);
    }
  }


  function clampMapperZoom(value: number) {
    return Math.max(1, Math.min(16, value));
  }

  function setMapperZoom(nextValue: number, clientX?: number, clientY?: number) {
    const next = clampMapperZoom(nextValue);
    const wrap = imageWrapRef.current;
    if (
      wrap &&
      typeof clientX === "number" &&
      typeof clientY === "number"
    ) {
      const box = wrap.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        zoomAnchorRef.current = {
          clientX,
          clientY,
          visualX: Math.max(0, Math.min(1, (clientX - box.left) / box.width)),
          visualY: Math.max(0, Math.min(1, (clientY - box.top) / box.height)),
        };
      }
    } else {
      zoomAnchorRef.current = null;
    }
    if (Math.abs(next - zoomRef.current) < 0.0015) {
      zoomAnchorRef.current = null;
      return;
    }
    zoomRef.current = next;
    setZoom(next);
  }

  function zoomAtCanvasCenter(nextValue: number) {
    const canvas = canvasRef.current;
    if (!canvas) {
      setMapperZoom(nextValue);
      return;
    }
    const box = canvas.getBoundingClientRect();
    setMapperZoom(
      nextValue,
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
  }

  function mapperGestureTargetIsHandle(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest(".mapper-point-handle"));
  }

  function currentTouchPair() {
    const touchPoints = [...activeGesturePointersRef.current.values()];
    if (touchPoints.length < 2) return null;
    const [a, b] = touchPoints;
    return {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      centerX: (a.x + b.x) / 2,
      centerY: (a.y + b.y) / 2,
    };
  }

  function armPanGesture(pointerId: number, x: number, y: number) {
    panGestureRef.current = {
      pointerId,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      moved: false,
    };
  }

  function resetGestureFrameQueue() {
    if (gestureFrameRef.current !== null) {
      cancelAnimationFrame(gestureFrameRef.current);
      gestureFrameRef.current = null;
    }
    pendingPanRef.current = { x: 0, y: 0 };
    pendingPinchRef.current = null;
  }

  function scheduleGestureFrame() {
    if (gestureFrameRef.current !== null) return;
    gestureFrameRef.current = requestAnimationFrame(() => {
      gestureFrameRef.current = null;
      const canvas = canvasRef.current;
      const pinch = pendingPinchRef.current;
      const pan = pendingPanRef.current;
      pendingPinchRef.current = null;
      pendingPanRef.current = { x: 0, y: 0 };
      if (!canvas) return;

      if (pinch) {
        // Finger-center movement and pinch scale are committed together in ONE
        // frame. Tiny sub-pixel tremor is ignored instead of shaking the image.
        if (Math.abs(pinch.panX) >= 0.25) canvas.scrollLeft += pinch.panX;
        if (Math.abs(pinch.panY) >= 0.25) canvas.scrollTop += pinch.panY;
        setMapperZoom(pinch.zoom, pinch.centerX, pinch.centerY);
        return;
      }

      if (Math.abs(pan.x) >= 0.25) canvas.scrollLeft += pan.x;
      if (Math.abs(pan.y) >= 0.25) canvas.scrollTop += pan.y;
    });
  }

  function queuePanDelta(x: number, y: number) {
    pendingPanRef.current = {
      x: pendingPanRef.current.x + x,
      y: pendingPanRef.current.y + y,
    };
    scheduleGestureFrame();
  }

  function queuePinchFrame(
    zoomValue: number,
    centerX: number,
    centerY: number,
    panX: number,
    panY: number,
  ) {
    const pending = pendingPinchRef.current;
    pendingPinchRef.current = {
      zoom: zoomValue,
      centerX,
      centerY,
      panX: (pending?.panX || 0) + panX,
      panY: (pending?.panY || 0) + panY,
    };
    // A pinch owns the frame; stale one-finger delta must never fight it.
    pendingPanRef.current = { x: 0, y: 0 };
    scheduleGestureFrame();
  }

  function handleMapperGesturePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!imageReady || mapperGestureTargetIsHandle(event.target)) return;

    if (event.pointerType === "touch") {
      activeGesturePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      const pair = currentTouchPair();
      if (pair) {
        // Once a second finger arrives, capture BOTH active pointers so pinch/pan
        // remains stable even when fingers leave the visible image bounds.
        for (const pointerId of activeGesturePointersRef.current.keys()) {
          try {
            event.currentTarget.setPointerCapture(pointerId);
          } catch {
            // An already-ended pointer simply cannot be captured.
          }
        }
        pinchGestureRef.current = {
          startDistance: pair.distance,
          startZoom: zoomRef.current,
          lastCenterX: pair.centerX,
          lastCenterY: pair.centerY,
        };
        panGestureRef.current = null;
        tapStartRef.current = null;
        suppressTapUntilRef.current = Date.now() + 600;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // In PAN mode one finger moves immediately. In SELECT mode we only start
      // moving after a >10px drag, so a normal tap still creates an exact corner.
      armPanGesture(event.pointerId, event.clientX, event.clientY);
      if (toolMode === "pan" && !calibrationMode) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Keep panning while the pointer remains inside if capture is unavailable.
        }
        event.preventDefault();
        event.stopPropagation();
      }
      // IMPORTANT: SELECT single-tap is deliberately NOT captured here. Its
      // pointerup must still bubble to the SVG tap handler and create a corner.
      return;
    }

    if (toolMode === "pan" && !calibrationMode && event.button === 0) {
      armPanGesture(event.pointerId, event.clientX, event.clientY);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Mouse/pen drag can continue without capture while inside the mapper.
      }
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleMapperGesturePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (mapperGestureTargetIsHandle(event.target)) return;

    if (
      event.pointerType === "touch" &&
      activeGesturePointersRef.current.has(event.pointerId)
    ) {
      activeGesturePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }

    const pair = currentTouchPair();
    if (pair) {
      let pinch = pinchGestureRef.current;
      if (!pinch) {
        pinch = {
          startDistance: pair.distance,
          startZoom: zoomRef.current,
          lastCenterX: pair.centerX,
          lastCenterY: pair.centerY,
        };
        pinchGestureRef.current = pinch;
      }

      const panX = pinch.lastCenterX - pair.centerX;
      const panY = pinch.lastCenterY - pair.centerY;
      pinch.lastCenterX = pair.centerX;
      pinch.lastCenterY = pair.centerY;

      const nextZoom =
        pinch.startZoom * (pair.distance / Math.max(1, pinch.startDistance));
      tapStartRef.current = null;
      suppressTapUntilRef.current = Date.now() + 600;
      queuePinchFrame(nextZoom, pair.centerX, pair.centerY, panX, panY);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const pan = panGestureRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    const totalMovement = Math.hypot(
      event.clientX - pan.startX,
      event.clientY - pan.startY,
    );
    const shouldPan =
      !calibrationMode &&
      (
        toolMode === "pan" ||
        (event.pointerType === "touch" && totalMovement > 10)
      );
    if (!shouldPan) return;

    // SELECT becomes a pan only after the movement threshold. Capture from this
    // point onward so the drag keeps working outside the immediate plot image.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable for a pointer that just ended.
    }

    const deltaX = pan.lastX - event.clientX;
    const deltaY = pan.lastY - event.clientY;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
    queuePanDelta(deltaX, deltaY);

    if (!pan.moved) {
      pan.moved = true;
      tapStartRef.current = null;
    }
    suppressTapUntilRef.current = Date.now() + 350;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMapperGesturePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (mapperGestureTargetIsHandle(event.target)) return;

    const pointerWasTracked =
      event.pointerType === "touch" &&
      activeGesturePointersRef.current.has(event.pointerId);
    const wasPinching =
      Boolean(pinchGestureRef.current) ||
      activeGesturePointersRef.current.size >= 2;
    const pan = panGestureRef.current;
    const wasPanning =
      Boolean(pan && pan.pointerId === event.pointerId && pan.moved);

    if (pointerWasTracked) activeGesturePointersRef.current.delete(event.pointerId);

    const blockTap =
      wasPinching ||
      wasPanning ||
      Date.now() < suppressTapUntilRef.current;
    if (blockTap) {
      tapStartRef.current = null;
      suppressTapUntilRef.current = Date.now() + 350;
      event.preventDefault();
      event.stopPropagation();
    }

    if (activeGesturePointersRef.current.size < 2) {
      pinchGestureRef.current = null;
    }

    const remaining = [...activeGesturePointersRef.current.entries()][0];
    if (remaining) {
      const [pointerId, point] = remaining;
      armPanGesture(pointerId, point.x, point.y);
    } else if (!pan || pan.pointerId === event.pointerId) {
      panGestureRef.current = null;
    }

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Nothing to release.
    }
  }

  function handleMapperGesturePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (mapperGestureTargetIsHandle(event.target)) return;
    resetGestureFrameQueue();
    activeGesturePointersRef.current.delete(event.pointerId);
    panGestureRef.current = null;
    pinchGestureRef.current = null;
    tapStartRef.current = null;
    suppressTapUntilRef.current = Date.now() + 350;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMapperLostPointerCapture(event: React.PointerEvent<HTMLDivElement>) {
    activeGesturePointersRef.current.delete(event.pointerId);
    if (panGestureRef.current?.pointerId === event.pointerId) {
      panGestureRef.current = null;
    }
    if (activeGesturePointersRef.current.size < 2) {
      pinchGestureRef.current = null;
    }
  }

  function sourcePointFromDisplay(point: MapperPoint): MapperPoint {
    const [x, y] = point;
    // Exact inverse of displayPoint. A tap made on a rotated view is converted
    // back to source-image coordinates before snap/save, so live SVG/2D/3D stay correct.
    if (rotation === 1) return [y, 1 - x];
    if (rotation === 2) return [1 - x, 1 - y];
    if (rotation === 3) return [1 - y, x];
    return [x, y];
  }

  function rotateMapperView(direction: -1 | 1) {
    setRotation((current) => {
      const next = ((current + direction + 4) % 4) as 0 | 1 | 2 | 3;
      try {
        window.localStorage.setItem(`rekixo:mapper-rotation:${projectId}`, String(next));
      } catch {
        // Device preference persistence is optional; mapping must keep working.
      }
      return next;
    });
    // A quarter turn changes portrait/landscape bounds. Fit once, then user can zoom again.
    resetGestureFrameQueue();
    activeGesturePointersRef.current.clear();
    panGestureRef.current = null;
    pinchGestureRef.current = null;
    zoomAnchorRef.current = null;
    tapStartRef.current = null;
    suppressTapUntilRef.current = Date.now() + 250;
    zoomRef.current = 1;
    setZoom(1);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.scrollLeft = 0;
          canvas.scrollTop = 0;
        }
      });
    });
  }

  function resetMapperView() {
    resetGestureFrameQueue();
    activeGesturePointersRef.current.clear();
    panGestureRef.current = null;
    pinchGestureRef.current = null;
    zoomAnchorRef.current = null;
    tapStartRef.current = null;
    suppressTapUntilRef.current = Date.now() + 250;
    zoomRef.current = 1;
    setZoom(1);
    setRotation(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.scrollLeft = 0;
          canvas.scrollTop = 0;
        }
      });
    });
    try {
      window.localStorage.setItem(`rekixo:mapper-rotation:${projectId}`, "0");
    } catch {
      // Ignore private-mode/localStorage failures.
    }
  }

  function svgPointFromClient(clientX: number, clientY: number): MapperPoint | null {
    const wrap = imageWrapRef.current;
    if (!wrap) return null;
    const box = wrap.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const visual: MapperPoint = [
      Math.max(0, Math.min(1, (clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (clientY - box.top) / box.height)),
    ];
    // Rotation is view-only. Convert the visible portrait/landscape coordinates
    // back into the original masterplan coordinate system before snapping/saving.
    return sourcePointFromDisplay(visual);
  }

  function precisePoint(raw: MapperPoint) {
    const wrap = imageWrapRef.current;
    if (!wrap) return raw;
    const box = wrap.getBoundingClientRect();
    // Snap math runs in canonical SOURCE coordinates. At 90°/270° the source X
    // axis is rendered along the visible height and source Y along visible width.
    const sourceRenderedWidth = rotation === 1 || rotation === 3 ? box.height : box.width;
    const sourceRenderedHeight = rotation === 1 || rotation === 3 ? box.width : box.height;
    return snapPoint(raw, mappedPolygons, sourceRenderedWidth, sourceRenderedHeight, 18).point;
  }

  function imageTap(point: MapperPoint) {
    if (completedProject) return;
    if (calibrationMode) {
      if (!pendingCadPoint) {
        notify("पहले CAD preview में reference point tap करें");
        return;
      }
      setCalibrationPairs((current) => [
        ...current.slice(0, 11),
        { source: pendingCadPoint, target: point },
      ]);
      setPendingCadPoint(null);
      notify(
        calibrationPairs.length + 1 >= 4
          ? "Calibration ready — overlay check करें, जरूरत हो तो extra pair जोड़ें"
          : `Pair ${calibrationPairs.length + 1} saved — अगला CAD point चुनें`,
      );
      return;
    }
    if (toolMode !== "select") return;
    if (manualPhase !== "select") return;
    const snapped = precisePoint(point);
    setPoints((current) => {
      if (shape === "quad") {
        if (current.length >= 4) return [snapped];
        const next = [...current, snapped];
        if (next.length === 4) setManualPhase("details");
        return next;
      }
      return current.length < 80 ? [...current, snapped] : current;
    });
  }

  function handleImagePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!calibrationMode && toolMode !== "select") return;
    event.preventDefault();
    event.stopPropagation();
    tapStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function handleImagePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!calibrationMode && toolMode !== "select") return;
    if (Date.now() < suppressTapUntilRef.current) {
      tapStartRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const start = tapStartRef.current;
    tapStartRef.current = null;
    if (!start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
    const point = svgPointFromClient(event.clientX, event.clientY);
    if (point) imageTap(point);
  }

  function dragHandle(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingPoint(index);
    const point = svgPointFromClient(event.clientX, event.clientY);
    if (point) {
      const snapped = precisePoint(point);
      setPoints((current) => current.map((item, cursor) => (cursor === index ? snapped : item)));
      setLoupePoint(snapped);
    }
  }

  function moveHandle(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (draggingPoint !== index) return;
    event.preventDefault();
    const point = svgPointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const snapped = precisePoint(point);
    setPoints((current) => current.map((item, cursor) => (cursor === index ? snapped : item)));
    setLoupePoint(snapped);
  }

  function endHandle() {
    setDraggingPoint(null);
    setLoupePoint(null);
  }

  async function verifyPlotPersistence(saved: Plot) {
    const expected = parsePolygon(saved);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const verifyResponse = await fetch(
        `/api/super-mapper?projectId=${encodeURIComponent(projectId)}&verify=${Date.now()}`,
        { cache: "no-store" },
      );
      const verifyData = await apiResult(verifyResponse);
      const verifiedPlots = (verifyData.plots || []) as Plot[];
      const persisted = verifiedPlots.find((item) => item.id === saved.id);
      if (persisted) {
        const actual = parsePolygon(persisted);
        const sameGeometry =
          expected.length === actual.length &&
          expected.every(
            (point, index) =>
              Math.abs(point[0] - actual[index][0]) <= 1e-9 &&
              Math.abs(point[1] - actual[index][1]) <= 1e-9,
          );
        if (sameGeometry) return { plot: persisted, plots: verifiedPlots };
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
      }
    }
    throw new Error(
      `Plot ${saved.id} server read-back verify नहीं हुआ. Current shape screen/draft में सुरक्षित है; आगे नहीं बढ़ाया गया.`,
    );
  }

  async function confirmPlot() {
    const id = cleanPlotId(plotId);
    const existing = plots.find((plot) => plot.id === editingId || plot.id === id);
    const parsedArea = Number(sqft);
    const area = Number.isFinite(parsedArea) && parsedArea > 0
      ? parsedArea
      : Number(existing?.sqft || 0);
    if (!id) return notify("Plot number जरूरी है");
    if (points.length < 3) return notify("पहले plot boundary पूरी select करें");
    if (shape === "quad" && points.length !== 4)
      return notify("4-corner plot के चारों corners select करें");
    if (polygonSelfIntersects(points))
      return notify("Shape cross हो रही है — corner order/handles ठीक करें");
    if (!editingId && plots.some((plot) => plot.id === id && plot.polygon)) {
      return notify(`${id} पहले से mapped है — list से Edit करें`);
    }
    if (editingId && id !== editingId && plots.some((plot) => plot.id === id)) {
      return notify(`Plot ${id} inventory में पहले से मौजूद है`);
    }
    const unchangedInventoryArea =
      Boolean(existing) && area > 0 && Math.abs(Number(existing?.sqft || 0) - area) < 0.0001;
    const plot: Plot = {
      id,
      sqft: area,
      sqm: area > 0
        ? unchangedInventoryArea ? Number(existing?.sqm || area / 10.7639) : area / 10.7639
        : Number(existing?.sqm || 0),
      sqyd: area > 0
        ? unchangedInventoryArea ? Number(existing?.sqyd || area / 9) : area / 9
        : Number(existing?.sqyd || 0),
      dimensions: dimensions.trim() || existing?.dimensions || "",
      road: road.trim() || existing?.road || "",
      status: existing?.status || "available",
      notes: existing?.notes || "",
      featured: existing?.featured || false,
      polygon: JSON.stringify(points),
    };
    setBusy(true);
    try {
      const response = await fetch("/api/super-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, plot }),
      });
      const result = await apiResult(response);
      const saved = result.plot as Plot;

      // Never clear the draft or advance to the next plot until a second,
      // no-cache server read confirms the exact polygon that was just written.
      const verified = await verifyPlotPersistence(saved);
      setPlots(verified.plots);
      setLastVerifiedId(verified.plot.id);
      try {
        window.localStorage.removeItem(mappingDraftKey(projectId, verified.plot.id));
      } catch {
        // Ignore local draft cleanup failures.
      }
      setToolMode("pan");
      selectNextPlot(verified.plot.id);
      notify(
        `Plot ${verified.plot.id} SERVER VERIFIED ✓ — live project data ready; next plot open`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Plot save नहीं हुआ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(plot: Plot) {
    if (!confirm(`Plot ${plot.id} की saved clickable boundary हटाएँ? Plot details/status सुरक्षित रहेंगे।`)) return;
    setBusy(true);
    try {
      const cleared: Plot = { ...plot, polygon: "" };
      const response = await fetch("/api/super-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, plot: cleared }),
      });
      const result = await apiResult(response);
      const saved = (result.plot || cleared) as Plot;

      // Clearing a mapped plot is also a persistent mutation. Do not tell the
      // operator it is gone until a second no-cache read confirms polygon="".
      const verified = await verifyPlotPersistence(saved);
      setPlots(verified.plots);
      setLastVerifiedId(verified.plot.id);
      setPoints([]);
      setEditingId("");
      setManualPhase("select");
      setToolMode("select");
      try {
        window.localStorage.removeItem(mappingDraftKey(projectId, verified.plot.id));
      } catch {
        // Local draft cleanup is best-effort; server data is already verified.
      }
      loadPlotDetails({ ...verified.plot, polygon: "" }, false);
      notify(`Plot ${verified.plot.id} boundary SERVER VERIFIED removed ✓; details/status सुरक्षित हैं`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Boundary नहीं हटी");
    } finally {
      setBusy(false);
    }
  }

  function cadTap(event: React.PointerEvent<SVGSVGElement>) {
    if (!calibrationMode || completedProject) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point: MapperPoint = [
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    ];
    setPendingCadPoint(point);
    notify("अब masterplan image पर यही reference point tap करें");
    canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveCalibration() {
    if (calibrationPairs.length < 4 || !liveMatrix)
      return notify("पहले 4 दूर-दूर calibration pairs बनाएं");
    const error = calibrationPairs.length >= 4 ? calibrationError(liveMatrix, calibrationPairs) : 0;
    setBusy(true);
    try {
      const response = await fetch("/api/super-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          settings: {
            homography: JSON.stringify(liveMatrix),
            calibrationPairs: JSON.stringify(calibrationPairs),
            calibrationError: String(error),
            cadMatchedCount: String(acceptedAutoMatches.length),
            cadReviewCount: String(reviewPlots.length),
          },
        }),
      });
      await apiResult(response);
      setSettings((current) => ({
        ...current,
        homography: JSON.stringify(liveMatrix),
        calibrationPairs: JSON.stringify(calibrationPairs),
        calibrationError: String(error),
        cadMatchedCount: String(acceptedAutoMatches.length),
        cadReviewCount: String(reviewPlots.length),
      }));
      setCalibrationMode(false);
      notify(`Calibration saved — ${acceptedAutoMatches.length} Auto-ready, ${reviewPlots.length} Review`);
    } catch (errorValue) {
      notify(errorValue instanceof Error ? errorValue.message : "Calibration save नहीं हुई");
    } finally {
      setBusy(false);
    }
  }

  async function publishAutoMatches() {
    const pending = acceptedAutoMatches.filter((match) => !match.plot.polygon);
    if (!pending.length) return notify("Auto-matched new plots बाकी नहीं हैं");
    if (!confirm(`${pending.length} matched plots को clickable 2D + 3D publish करें?`)) return;
    setBusy(true);
    try {
      const payload = pending.map(({ plot, points: polygon }) => ({
        ...plot,
        polygon: JSON.stringify(
          polygon.map(([x, y]) => [
            Math.max(0, Math.min(1, x)),
            Math.max(0, Math.min(1, y)),
          ]),
        ),
      }));
      const response = await fetch("/api/super-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, plots: payload }),
      });
      const result = await apiResult(response);
      const saved = (result.plots || []) as Plot[];
      const byId = new Map(saved.map((plot) => [plot.id, plot]));
      setPlots((current) => current.map((plot) => byId.get(plot.id) || plot));
      notify(`${saved.length} plots एक साथ 2D + 3D clickable publish हुए`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Auto publish नहीं हुआ");
    } finally {
      setBusy(false);
    }
  }

  const currentPlot = plots.find((plot) => plot.id === plotId);
  const currentHasSavedBoundary = Boolean(
    currentPlot && parsePolygon(currentPlot).length >= 3,
  );
  const currentCenter = points.length ? polygonCenter(points) : null;
  const shapeInvalid = points.length >= 4 && polygonSelfIntersects(points);
  const shapeReady = points.length >= 3 && (shape === "polygon" || points.length === 4) && !shapeInvalid;
  const rotationDegrees = rotation * 90;
  const rotationSwapsAxes = rotation === 1 || rotation === 3;

  // Prefer dimensions decoded from the ACTUAL displayed mapping image. Stored
  // original dimensions are fallback only; mapping dimensions are final fallback.
  const sourceWidth =
    naturalImageSize?.width ||
    settingsNumber(settings.masterplanOriginalWidth, mapWidth);
  const sourceHeight =
    naturalImageSize?.height ||
    settingsNumber(settings.masterplanOriginalHeight, mapHeight);
  const sourceAspect = sourceWidth / sourceHeight;

  const mapperAspectRatio = rotationSwapsAxes
    ? `${sourceHeight} / ${sourceWidth}`
    : `${sourceWidth} / ${sourceHeight}`;

  // 100% = complete undistorted image fit. Zoom only scales this base; it never
  // changes proportions. For 90/270 the OUTER viewport swaps axes.
  const visualAspect = rotationSwapsAxes ? 1 / sourceAspect : sourceAspect;
  const mapperViewportWidth =
    `min(${zoom * 100}%, ${(zoom * 58 * visualAspect).toFixed(4)}vh)`;

  // Image, SVG, saved polygons and handles all live on the exact same natural-ratio
  // source plane. Quarter-turn rotation changes orientation, never geometry ratio.
  const sourceSceneWidth = rotationSwapsAxes
    ? `${sourceAspect * 100}%`
    : "100%";
  const sourceSceneAspectRatio = `${sourceWidth} / ${sourceHeight}`;

  return (
    <section className="mapper-shell auto-cad-mapper" onContextMenu={(event) => event.preventDefault()}>
      <div className="card mapper-tools mapper-v2-head">
        <div className="section-title">
          <MousePointer2 />
          <div>
            <h2>Rekixo Plot Mapper</h2>
            <p>Main masterplan image → full zoom → exact corners → SVG hotspot → details → publish. CAD optional assistant है.</p>
          </div>
        </div>

        <div className="mapper-v2-progress">
          <span className={hasMasterplan ? "done" : "active"}><b>1</b> Sources</span>
          <span className={mappedPlots.length ? "done" : hasMasterplan ? "active" : ""}><b>2</b> Plot Mapping</span>
          <span className={hasPlotSheet ? "done" : ""}><b>3</b> Details</span>
          <span className={unmappedPlots.length ? "active" : mappedPlots.length ? "done" : ""}><b>4</b> Review</span>
          <span className={mappedPlots.length && !unmappedPlots.length ? "done" : ""}><b>5</b> Publish</span>
        </div>

        <div className="mapper-source-grid">
          <label className={`mapper-upload-card ${hasMasterplan ? "ready" : ""}`}>
            <span><ImagePlus /></span>
            <div><b>{hasMasterplan ? "Masterplan ready" : "1. Masterplan image"}</b><small>{settings.masterplanName || "High-resolution JPG/PNG/WebP"}</small></div>
            {hasMasterplan && <CheckCircle2 className="mapper-ready-icon" />}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || completedProject} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "masterplan")} />
          </label>

          <label className={`mapper-upload-card ${hasCad ? "ready" : ""}`}>
            <span><FileText /></span>
            <div><b>{hasCad ? "CAD source saved" : "Advanced · DWG / DXF"}</b><small>{settings.sourceCadName || "Optional assistant — normal mapping ke liye जरूरी नहीं"}</small></div>
            {hasCad && <CheckCircle2 className="mapper-ready-icon" />}
            <input type="file" accept=".dwg,.dxf,application/acad,application/dxf,application/octet-stream" disabled={busy || completedProject} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "sourceCad")} />
          </label>

          <label className={`mapper-upload-card ${hasPlotSheet ? "ready" : ""}`}>
            <span><FileText /></span>
            <div><b>{hasPlotSheet ? `Plot inventory · ${plots.length}` : "2. Plot details sheet"}</b><small>{settings.plotSheetName || "CSV/JSON: ID, sqft/sqm, dimensions, facing"}</small></div>
            {hasPlotSheet && <CheckCircle2 className="mapper-ready-icon" />}
            <input type="file" accept=".csv,.json,text/csv,application/json" disabled={busy || completedProject} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "plotSheet")} />
          </label>

          <label className={`mapper-upload-card ${hasPdf ? "ready" : ""}`}>
            <span><FileText /></span>
            <div><b>{hasPdf ? "Technical PDF saved" : "3. PDF reference"}</b><small>{settings.sourcePdfName || "Original sanctioned/technical sheet"}</small></div>
            {hasPdf && <CheckCircle2 className="mapper-ready-icon" />}
            <input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "sourcePdf")} />
          </label>
        </div>

        <div className="mapper-source-actions">
          <button type="button" onClick={downloadPlotSheetTemplate}><FileText /> Download CSV template</button>
          <small>Plot sheet re-import existing clickable boundary aur Booked/Sold status ko preserve karta hai.</small>
        </div>

        <div className="mapper-source-meta">
          <span>Mapping: <b>{Math.round(mapWidth)} × {Math.round(mapHeight)}</b></span>
          {settings.masterplanOriginalWidth && settings.masterplanOriginalHeight && <span>Source: <b>{settings.masterplanOriginalWidth} × {settings.masterplanOriginalHeight}</b></span>}
          <span>Inventory: <b>{plots.length}</b></span>
          <span>Mapped: <b>{mappedPlots.length}</b></span>
          <span>Review: <b>{unmappedPlots.length}</b></span>
          <span>Last server verify: <b>{lastVerifiedId ? `Plot ${lastVerifiedId} ✓` : "—"}</b></span>
        </div>
        {settings.sourcePdfName && <a className="mapper-pdf-link" href={assetUrl("sourcePdf")} target="_blank" rel="noreferrer"><FileText /> Open technical PDF reference</a>}
        {settings.cadParseError && <div className="mapper-warning">CAD source सुरक्षित है, लेकिन automatic geometry parse नहीं हुआ: {settings.cadParseError}. DXF export upload करें या Manual Precise fallback use करें.</div>}
      </div>

      {cadGeometry && !completedProject && (
        <details className="card cad-assistant-card">
          <summary>
            <span><b>Advanced CAD Assistant</b><small>Optional auto-suggestions; normal plot mapping main image par hoti hai.</small></span>
            <em>{cadGeometry.candidates.length} candidates</em>
          </summary>
          <div className="calibration-card">
          <div className="calibration-head">
            <div>
              <small>AUTO CAD CALIBRATION</small>
              <h3>{cadGeometry.candidates.length} closed CAD boundaries detected</h3>
              <p>CAD और rendered masterplan के वही 4 दूर-दूर reference points pair करें. Extra 1–4 pairs accuracy और improve कर सकते हैं.</p>
            </div>
            <div className="calibration-count"><b>{calibrationPairs.length || (savedMatrix ? 4 : 0)}</b><span>pairs</span></div>
          </div>

          <div className="calibration-actions">
            <button className={calibrationMode ? "primary" : ""} onClick={() => { setCalibrationMode((value) => !value); setPendingCadPoint(null); }}>
              {calibrationMode ? "Calibration ON" : savedMatrix ? "Recalibrate" : "Start calibration"}
            </button>
            <button disabled={!calibrationPairs.length} onClick={() => { setCalibrationPairs((current) => current.slice(0, -1)); setPendingCadPoint(null); }}><Undo2 />Undo pair</button>
            <button disabled={!calibrationPairs.length} onClick={() => { setCalibrationPairs([]); setPendingCadPoint(null); }}>Reset pairs</button>
            <button className="primary" disabled={calibrationPairs.length < 4 || !liveMatrix || busy} onClick={saveCalibration}><Save />Save calibration</button>
          </div>

          <div className="calibration-grid">
            <div className="cad-preview-wrap">
              <div className="preview-label"><b>A. CAD reference</b><span>{pendingCadPoint ? "Selected ✓ — now tap image" : calibrationMode ? "Tap reference point" : "Preview"}</span></div>
              <svg className="cad-preview" viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerUp={cadTap}>
                {cadGeometry.candidates.map((candidate) => <polygon key={candidate.key} points={candidate.points.map(([x,y]) => `${x * 1000},${y * 1000}`).join(" ")} />)}
                {cadGeometry.labels.slice(0, 600).map((label, index) => <text key={`${label.text}-${index}`} x={label.point[0] * 1000} y={label.point[1] * 1000}>{label.text}</text>)}
                {calibrationPairs.map((pair, index) => <g key={`cad-pair-${index}`}><circle cx={pair.source[0] * 1000} cy={pair.source[1] * 1000} r="14"/><text className="pair-number" x={pair.source[0] * 1000} y={pair.source[1] * 1000}>{index + 1}</text></g>)}
                {pendingCadPoint && <circle className="pending" cx={pendingCadPoint[0] * 1000} cy={pendingCadPoint[1] * 1000} r="18" />}
              </svg>
            </div>
            <div className="calibration-instructions">
              <b>Best anchors</b>
              <p>Site boundary / road intersection जैसे साफ points चुनें — चारों corners में spread रखें. Plot-number text को anchor मत बनाएं.</p>
              <div className="calibration-stats">
                <span>CAD candidates <b>{cadGeometry.candidates.length}</b></span>
                <span>CAD labels <b>{cadGeometry.labels.length}</b></span>
                <span>Auto ready <b>{acceptedAutoMatches.length}</b></span>
                <span>Area review <b>{areaReviewMatches.length}</b></span>
                <span>Need review <b>{reviewPlots.length}</b></span>
                <span>Area validation <b>{cadAreaScale ? "ON" : "—"}</b></span>
              </div>
              {liveMatrix && <label className="overlay-toggle"><input type="checkbox" checked={showCadOverlay} onChange={(event) => setShowCadOverlay(event.target.checked)} /> Show transformed CAD overlay on masterplan</label>}
            </div>
          </div>
          </div>
        </details>
      )}

      <div className="mapper-work mapper-v4-work">
        <div
          ref={canvasRef}
          className={`mapper-canvas card mapper-precision-canvas mapper-v4-canvas ${toolMode === "pan" ? "pan-mode" : "select-mode"}`}
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
        >
          <div className="mapper-v4-current">
            <button type="button" onClick={() => selectSiblingPlot(-1)} disabled={!inventoryPlots.length} aria-label="Previous plot"><ChevronLeft /></button>
            <label>
              <small>Current plot</small>
              <select value={plotId} onChange={(event) => {
                const next = plots.find((item) => item.id === event.target.value);
                if (next) loadPlotDetails(next, Boolean(next.polygon));
                else setPlotId(event.target.value);
              }}>
                {inventoryPlots.length
                  ? inventoryPlots.map((plot) => <option key={plot.id} value={plot.id}>{plot.id} · {plot.polygon ? "mapped" : "pending"}</option>)
                  : <option value={plotId}>{plotId}</option>}
              </select>
            </label>
            <span><b>{mappedPlots.length}</b>/{plots.length || "—"}</span>
            <button type="button" onClick={() => selectSiblingPlot(1)} disabled={!inventoryPlots.length} aria-label="Next plot"><ChevronRight /></button>
          </div>
          <div className="mapper-zoombar mapper-v4-toolbar">
            <button className={toolMode === "pan" ? "active" : ""} type="button" onClick={() => { setToolMode("pan"); setCalibrationMode(false); }}><Hand />Pan</button>
            <button className={toolMode === "select" ? "active" : ""} type="button" onClick={enableSelectMode}><Target />Select</button>
            <strong>{shape === "quad" ? `Plot ${plotId} · ${points.length}/4 corners` : `Plot ${plotId} · ${points.length} corners`}</strong>
            <span>{Math.round(zoom * 100)}%</span>
            <input className="mapper-zoom-range" type="range" min="1" max="16" step="0.1" value={zoom} onChange={(event) => zoomAtCanvasCenter(Number(event.target.value))} aria-label="Zoom level" />
            <button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => zoomAtCanvasCenter(zoomRef.current - 0.5)}><ZoomOut /></button>
            <button aria-label="Zoom in" disabled={zoom >= 16} onClick={() => zoomAtCanvasCenter(zoomRef.current + 0.5)}><ZoomIn /></button>
            <button
              type="button"
              aria-label="Rotate masterplan left 90 degrees"
              title="Rotate 90° left — portrait/landscape mapping view"
              onClick={() => rotateMapperView(-1)}
            >↺ 90°</button>
            <button
              type="button"
              aria-label="Rotate masterplan right 90 degrees"
              title="Rotate 90° right — portrait/landscape mapping view"
              onClick={() => rotateMapperView(1)}
            >↻ 90°</button>
            <button aria-label="Reset zoom and rotation" title="Reset orientation" onClick={resetMapperView}><RotateCcw /></button>
            <button aria-label="Toggle mapping focus/fullscreen" onClick={toggleMapperFullscreen}><Maximize2 />Focus</button>
          </div>

          {!imageReady && <div className="mapper-loading">{hasMasterplan ? "High-resolution masterplan load हो रहा है…" : "पहले masterplan image upload करें"}</div>}
          <div className="mapper-pan-hint">{toolMode === "pan" ? `PAN: 1 finger drag = move · 2 fingers pinch = zoom + move · ↺/↻ 90° = rotate. Current: ${rotationDegrees}°.` : `SELECT: tap = corner · खाली जगह drag = move · 2 fingers pinch = zoom + move. Rotation ${rotationDegrees}° सिर्फ view है; saved geometry original image coordinates में रहती है.`}</div>
          <div
            ref={imageWrapRef}
            className="mapper-image-wrap mapper-image-v2"
            style={{
              width: mapperViewportWidth,
              maxWidth: "none",
              aspectRatio: mapperAspectRatio,
              overflow: "hidden",
              marginInline: "auto",
              flex: "0 0 auto",
            }}
            onPointerDownCapture={handleMapperGesturePointerDown}
            onPointerMoveCapture={handleMapperGesturePointerMove}
            onPointerUpCapture={handleMapperGesturePointerEnd}
            onPointerCancelCapture={handleMapperGesturePointerCancel}
            onLostPointerCapture={handleMapperLostPointerCapture}
            onContextMenu={(event) => event.preventDefault()}
            onDragStart={(event) => event.preventDefault()}
          >
            <div
              className="mapper-rotated-scene"
              data-rotation={rotationDegrees}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: sourceSceneWidth,
                aspectRatio: sourceSceneAspectRatio,
                transform: `translate(-50%, -50%) rotate(${rotationDegrees}deg)`,
                transformOrigin: "center center",
              }}
            >
              <img
                src={imageUrl}
                alt="Project masterplan"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setNaturalImageSize({
                      width: image.naturalWidth,
                      height: image.naturalHeight,
                    });
                  }
                  setImageReady(true);
                }}
                onError={() => {
                  setNaturalImageSize(null);
                  setImageReady(false);
                }}
                draggable={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  maxWidth: "none",
                  maxHeight: "none",
                  objectFit: "contain",
                  objectPosition: "center",
                  transform: "none",
                }}
              />
              {imageReady && (
                <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={handleImagePointerDown} onPointerUp={handleImagePointerUp}>
                  {mappedPlots.map((plot) => {
                    const polygon = parsePolygon(plot);
                    if (polygon.length < 3) return null;
                    const center = polygonCenter(polygon);
                    return <g key={plot.id} className={editingId === plot.id ? "mapped-plot editing" : "mapped-plot"}>
                      <polygon points={polygon.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")} />
                      <text x={center[0] * 1000} y={center[1] * 1000}>{plot.id}</text>
                    </g>;
                  })}
                  {showCadOverlay && liveMatrix && cadTransformed.map(({ candidate, points: polygon }) => (
                    <polygon key={`cad-${candidate.key}`} className="cad-transformed" points={polygon.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")} />
                  ))}
                  {acceptedAutoMatches.map((match) => !match.plot.polygon && (
                    <polygon key={`match-${match.plot.id}`} className="auto-match" points={match.points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")} />
                  ))}
                  {[...areaReviewMatches, ...excludedAutoMatches].map((match) => !match.plot.polygon && (
                    <polygon key={`review-${match.plot.id}`} className="cad-review" points={match.points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")} />
                  ))}
                  {points.length >= 2 && <polygon className="draft" points={points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")} />}
                  {calibrationPairs.map((pair, index) => (
                    <g key={`img-pair-${index}`} className="image-calibration-point">
                      <circle cx={pair.target[0] * 1000} cy={pair.target[1] * 1000} r="12"/>
                      <text x={pair.target[0] * 1000} y={pair.target[1] * 1000}>{index + 1}</text>
                    </g>
                  ))}
                </svg>
              )}
              {!calibrationMode && imageReady && points.map(([x, y], index) => (
                <button
                  type="button"
                  className="mapper-point-handle draggable"
                  key={`handle-${index}`}
                  style={{
                    left: `${x * 100}%`,
                    top: `${y * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${-rotationDegrees}deg)`,
                  }}
                  onPointerDown={(event) => dragHandle(event, index)}
                  onPointerMove={(event) => moveHandle(event, index)}
                  onPointerUp={endHandle}
                  onPointerCancel={endHandle}
                  aria-label={`Drag corner ${index + 1}`}
                >{index + 1}</button>
              ))}
            </div>
            {loupePoint && <div className="mapper-loupe" style={{
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: `${zoom * 400}% auto`,
              backgroundPosition: `${loupePoint[0] * 100}% ${loupePoint[1] * 100}%`,
              transform: `rotate(${rotationDegrees}deg)`,
            }}><i /></div>}
          </div>
          {!completedProject && (
            <div className="mapper-v4-bottom-bar">
              <button type="button" disabled={!points.length} onClick={undoPoint}><Undo2 />Undo</button>
              <button
                type="button"
                disabled={busy || (!points.length && !currentHasSavedBoundary)}
                onClick={clearCurrentSelection}
              >{currentHasSavedBoundary ? "Remove saved" : "Clear"}</button>
              <button type="button" onClick={clonePreviousShape}><Copy />Clone prev</button>
              <button
                type="button"
                className="primary"
                disabled={busy || !shapeReady}
                onClick={confirmPlot}
              ><CheckCircle2 />{busy ? "Saving…" : editingId ? `Update ${plotId}` : `Confirm ${plotId} →`}</button>
            </div>
          )}
          {shapeInvalid && <div className="mapper-shape-error">Shape cross ho rahi hai. Handles ko clockwise order me adjust karein.</div>}
        </div>

        <aside className="card mapper-list mapper-review-list">
          <h3>Project plots <b>{mappedPlots.length}/{plots.length || "—"}</b></h3>
          <div className="review-summary">
            <span className="ok">Mapped {mappedPlots.length}</span>
            <span className="auto">Auto ready {acceptedAutoMatches.filter((match) => !match.plot.polygon).length}</span>
            <span className="warn">Review {reviewPlots.length}</span>
          </div>
          {inventoryPlots.length ? inventoryPlots.map((plot) => {
            const mapped = Boolean(plot.polygon);
            const rawAuto = !mapped && autoMatches.some((match) => match.plot.id === plot.id);
            const autoReady = !mapped && autoMatchIds.has(plot.id);
            const areaReview = !mapped && areaReviewIds.has(plot.id);
            return <article key={plot.id} className={mapped ? "mapped" : autoReady ? "auto-ready" : "needs-review"}>
              <button className="plot-row-main" onClick={() => loadPlotDetails(plot, mapped)}>
                <b>{plot.id}</b><small>{plot.dimensions || `${Number(plot.sqft).toFixed(0)} sq.ft`}</small>
                <em>{mapped ? "Mapped" : autoReady ? "Auto" : areaReview ? "Area review" : "Review"}</em>
              </button>
              {!completedProject && <div className="mapper-list-actions">
                {mapped ? <>
                  <button className="edit" onClick={() => loadPlotDetails(plot, true)} aria-label={`Edit ${plot.id}`}><Pencil /></button>
                  <button onClick={() => remove(plot)} aria-label={`Remove ${plot.id}`}><Trash2 /></button>
                </> : rawAuto ? <button
                  className={autoReady ? "auto-toggle included" : "auto-toggle"}
                  onClick={() => setExcludedAutoIds((current) => {
                    const next = new Set(current);
                    if (next.has(plot.id)) next.delete(plot.id); else next.add(plot.id);
                    return next;
                  })}
                  aria-label={autoReady ? `Move ${plot.id} to review` : `Use auto match for ${plot.id}`}
                >{autoReady ? "Auto ✓" : "Use Auto"}</button> : null}
              </div>}
            </article>;
          }) : <p>Plot sheet import करें या manual plot number से शुरू करें.</p>}
        </aside>
      </div>

      {!completedProject && liveMatrix && acceptedAutoMatches.length > 0 && (
        <div className="card auto-publish-card cad-only-card">
          <div>
            <small>AUTO MATCH REVIEW</small>
            <h3>{acceptedAutoMatches.length} Auto-ready · {reviewPlots.length} Review</h3>
            <p>Unique exact Plot ID के साथ CAD area भी project-wide inventory scale से verify होता है. {areaReviewMatches.length} area-mismatch match yellow Review में रोके गए हैं. Blue Auto row को भी tap करके Review में भेज सकते हैं — कोई geometry silently publish नहीं होती.</p>
          </div>
          <button className="primary" disabled={busy || !liveMatrix || !acceptedAutoMatches.some((match) => !match.plot.polygon)} onClick={publishAutoMatches}><CheckCircle2 /> Publish {acceptedAutoMatches.filter((match) => !match.plot.polygon).length} reviewed Auto plots</button>
        </div>
      )}

      {!completedProject && hasMasterplan && (
        <div className="card manual-fallback-card">
          <div className="manual-fallback-head">
            <div><small>PLOT MAPPING CONTROLS</small><h3>{currentPlot ? `Plot ${currentPlot.id}` : `Plot ${plotId}`}</h3><p>Main image source of truth है. Plot को full zoom करें, corners clockwise mark करें, handles से exact boundary fit करके Confirm करें.</p></div>
            <select value={plotId} onChange={(event) => {
              const id = event.target.value;
              const plot = plots.find((item) => item.id === id);
              if (plot) loadPlotDetails(plot, Boolean(plot.polygon));
              else setPlotId(id);
            }}>
              {plots.length ? inventoryPlots.map((plot) => <option key={plot.id} value={plot.id}>{plot.id} · {plot.polygon ? "mapped" : autoMatchIds.has(plot.id) ? "auto" : "review"}</option>) : <option value={plotId}>{plotId}</option>}
            </select>
          </div>

          {manualPhase === "select" ? <>
            <div className="mapper-mode">
              <button className={shape === "quad" ? "active" : ""} onClick={() => { setShape("quad"); setPoints([]); }}>Perspective plot · 4 corners</button>
              <button className={shape === "polygon" ? "active" : ""} onClick={() => { setShape("polygon"); setPoints([]); }}>Irregular · corner taps</button>
            </div>
            <div className="mapper-actions compact">
              <button disabled={!points.length} onClick={undoPoint}><Undo2 />Undo</button>
              <button
                disabled={busy || (!points.length && !currentHasSavedBoundary)}
                onClick={clearCurrentSelection}
              >{currentHasSavedBoundary ? "Remove saved boundary" : "Clear"}</button>
              <button onClick={clonePreviousShape}><Copy />Clone previous</button>
              {shape === "polygon" && <button className="primary" disabled={points.length < 3} onClick={() => setManualPhase("details")}><CheckCircle2 />Boundary complete</button>}
            </div>
            <small className="mapper-help">पहले PAN में plot को बड़ा zoom करें → SELECT करें → clockwise corners tap करें. Existing plot vertex/edge auto-snap होगा. Numbered handle drag करके pixel-level correction करें.</small>
          </> : <>
            <div className="mapper-fields guided-fields">
              <label><span>Plot number</span><input value={plotId} readOnly={Boolean(currentPlot)} onChange={(event) => setPlotId(event.target.value)} /></label>
              <label><span>Dimensions</span><input value={dimensions} onChange={(event) => setDimensions(event.target.value)} placeholder="12.00 × 9.00 m" /></label>
              <label><span>Area (sq.ft)</span><input type="number" min="0" value={sqft} onChange={(event) => setSqft(event.target.value)} /></label>
              <label><span>Facing / road</span><input value={road} onChange={(event) => setRoad(event.target.value)} placeholder="East face" /></label>
            </div>
            <div className="mapper-actions">
              <button onClick={() => setManualPhase("select")}><Pencil />Boundary बदलें</button>
              <button className="primary mapper-confirm" disabled={busy || !shapeReady} onClick={confirmPlot}><Save />{busy ? "Saving…" : editingId ? `Update ${plotId}` : `Save shape ${plotId} & open next`}</button>
            </div>
            <small className="mapper-help">Dimensions / area / facing optional metadata हैं; CSV/PDF से बाद में update हो सकते हैं. Shape independent save होती है.</small>
            {currentCenter && <small className="mapper-help">Boundary center {currentCenter[0].toFixed(4)}, {currentCenter[1].toFixed(4)} · normalized geometry यही SVG hit-area, 2D और 3D use करेंगे.</small>}
          </>}
        </div>
      )}
    </section>
  );
}
