"use client";

import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Download,
  Eraser,
  Move,
  Redo2,
  RotateCcw,
  Scissors,
  Undo2,
  Upload,
} from "lucide-react";
import styles from "./masterplan-mask-editor.module.css";

type Tool = "erase" | "restore" | "keep" | "pan";
type Point = { x: number; y: number };

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.5;
const HISTORY_LIMIT = 6;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeBaseName(value: string) {
  const clean = value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "masterplan";
}

export default function MasterplanMaskEditor({
  sourceUrl,
  disabled,
  onPreviewChange,
  notify,
}: {
  sourceUrl: string;
  disabled: boolean;
  onPreviewChange: (url: string | null) => void;
  notify: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const drawingRef = useRef<{ pointerId: number; last: Point } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const uploadUrlRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<Tool>("erase");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brushSize, setBrushSize] = useState(48);
  const [lockedSize, setLockedSize] = useState({ width: 0, height: 0 });
  const [edited, setEdited] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  const [keepPoints, setKeepPoints] = useState<Point[]>([]);
  const [displaySourceUrl, setDisplaySourceUrl] = useState(sourceUrl);
  const [sourceName, setSourceName] = useState("project-masterplan");

  const canvasSizeLabel = useMemo(
    () =>
      lockedSize.width && lockedSize.height
        ? `${lockedSize.width} × ${lockedSize.height}px`
        : "loading…",
    [lockedSize],
  );

  function releasePreviewUrl() {
    if (!previewUrlRef.current) return;
    URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }

  function releaseUploadUrl() {
    if (!uploadUrlRef.current) return;
    URL.revokeObjectURL(uploadUrlRef.current);
    uploadUrlRef.current = null;
  }

  useEffect(() => {
    return () => {
      releasePreviewUrl();
      releaseUploadUrl();
    };
  }, []);

  async function initializeFromUrl(
    url: string,
    name: string,
    expected?: { width: number; height: number },
  ) {
    setBusy(true);
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Masterplan image decode nahi hui"));
        image.src = url;
      });

      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!(width > 0) || !(height > 0)) {
        throw new Error("Masterplan image dimensions invalid hain");
      }
      if (expected && (width !== expected.width || height !== expected.height)) {
        throw new Error(
          `Replacement image ${width}×${height}px hai. Locked canvas ${expected.width}×${expected.height}px hi rehna chahiye.`,
        );
      }

      const original = originalRef.current || document.createElement("canvas");
      originalRef.current = original;
      original.width = width;
      original.height = height;
      const originalContext = original.getContext("2d", { willReadFrequently: true });
      if (!originalContext) throw new Error("Original canvas initialize nahi hua");
      originalContext.clearRect(0, 0, width, height);
      originalContext.drawImage(image, 0, 0, width, height);

      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Editor canvas initialize nahi hua");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Editor canvas initialize nahi hua");
      context.clearRect(0, 0, width, height);
      context.drawImage(original, 0, 0);

      setLockedSize({ width, height });
      setSourceName(safeBaseName(name));
      setReady(true);
      setEdited(false);
      setShowBefore(false);
      setKeepPoints([]);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      historyRef.current = [];
      redoRef.current = [];
      releasePreviewUrl();
      onPreviewChange(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setDisplaySourceUrl(sourceUrl);
    setSourceName("project-masterplan");
    void initializeFromUrl(sourceUrl, "project-masterplan").catch((error) => {
      setReady(false);
      notify(error instanceof Error ? error.message : "Masterplan editor load nahi hua");
    });
    // Project masterplan URL change means a new canonical source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl]);

  function snapshot() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || !canvas.width || !canvas.height) return;
    historyRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    redoRef.current = [];
  }

  function undo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    const previous = historyRef.current.pop();
    if (!canvas || !context || !previous) return;
    redoRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
    context.putImageData(previous, 0, 0);
    setEdited(true);
    setKeepPoints([]);
  }

  function redo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    const next = redoRef.current.pop();
    if (!canvas || !context || !next) return;
    historyRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
    context.putImageData(next, 0, 0);
    setEdited(true);
    setKeepPoints([]);
  }

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(canvas.width, ((event.clientX - rect.left) / rect.width) * canvas.width)),
      y: Math.max(0, Math.min(canvas.height, ((event.clientY - rect.top) / rect.height) * canvas.height)),
    };
  }

  function dab(point: Point, restore: boolean) {
    const canvas = canvasRef.current;
    const original = originalRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !original || !context) return;
    const radius = Math.max(2, brushSize / 2);

    if (restore) {
      context.save();
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.clip();
      context.globalCompositeOperation = "source-over";
      context.drawImage(original, 0, 0);
      context.restore();
      return;
    }

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function stroke(from: Point, to: Point, restore: boolean) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const spacing = Math.max(1, brushSize * 0.22);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      dab(
        {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        },
        restore,
      );
    }
  }

  function beginCanvasPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || busy || showBefore) return;

    if (tool === "keep") {
      const point = canvasPoint(event);
      if (!point) return;
      event.preventDefault();
      setKeepPoints((items) => [...items, point]);
      return;
    }

    if (tool === "pan") return;
    const point = canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    snapshot();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = { pointerId: event.pointerId, last: point };
    dab(point, tool === "restore");
    setEdited(true);
  }

  function moveCanvasPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const gesture = drawingRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    stroke(gesture.last, point, tool === "restore");
    gesture.last = point;
  }

  function endCanvasPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const gesture = drawingRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = null;
  }

  function beginPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || tool !== "pan" || zoom <= 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = panRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan({
      x: gesture.originX + event.clientX - gesture.startX,
      y: gesture.originY + event.clientY - gesture.startY,
    });
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = panRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
  }

  function setZoomLevel(value: number) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
    setZoom(next);
    if (next === 1) {
      setPan({ x: 0, y: 0 });
      if (tool === "pan") setTool("erase");
    }
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (tool === "pan") setTool("erase");
  }

  function restoreAll() {
    const canvas = canvasRef.current;
    const original = originalRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !original || !context) return;
    snapshot();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(original, 0, 0);
    setEdited(false);
    setKeepPoints([]);
    releasePreviewUrl();
    onPreviewChange(null);
    notify("Original masterplan restore ho gaya");
  }

  function applyKeepPolygon() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context || keepPoints.length < 3) {
      notify("Keep Area ke liye kam se kam 3 points lagayein");
      return;
    }
    snapshot();
    context.save();
    context.globalCompositeOperation = "destination-in";
    context.beginPath();
    context.moveTo(keepPoints[0].x, keepPoints[0].y);
    keepPoints.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fillStyle = "#000";
    context.fill();
    context.restore();
    setKeepPoints([]);
    setEdited(true);
    setTool("erase");
    notify("Polygon ke bahar ka area transparent ho gaya");
  }

  async function exportBlob(type: "image/png" | "image/webp") {
    const canvas = canvasRef.current;
    if (!canvas || !ready) throw new Error("Masterplan editor ready nahi hai");
    if (canvas.width !== lockedSize.width || canvas.height !== lockedSize.height) {
      throw new Error("Canvas dimension lock mismatch mila; export roka gaya");
    }
    const quality = type === "image/webp" ? 1 : undefined;
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Image export fail hua"))),
        type,
        quality,
      );
    });
  }

  async function applyPreview() {
    setBusy(true);
    try {
      const blob = await exportBlob("image/png");
      const nextUrl = URL.createObjectURL(blob);
      releasePreviewUrl();
      previewUrlRef.current = nextUrl;
      onPreviewChange(nextUrl);
      notify(`Masked PNG preview apply ho gaya · ${canvasSizeLabel} canvas unchanged`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Masked preview apply nahi hua");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPng() {
    setBusy(true);
    try {
      const blob = await exportBlob("image/png");
      downloadBlob(blob, `${sourceName}-masked.png`);
      notify(`Lossless PNG export ready · ${canvasSizeLabel}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "PNG export fail hua");
    } finally {
      setBusy(false);
    }
  }

  async function downloadWebp() {
    setBusy(true);
    try {
      const blob = await exportBlob("image/webp");
      downloadBlob(blob, `${sourceName}-masked.webp`);
      notify(`WebP max-quality export ready · ${canvasSizeLabel}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "WebP export fail hua");
    } finally {
      setBusy(false);
    }
  }

  async function chooseReplacement(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify("Sirf JPG, PNG ya WebP masterplan choose karein");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      notify("Masterplan file 40 MB se chhoti rakhein");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    try {
      await initializeFromUrl(
        nextUrl,
        file.name,
        lockedSize.width && lockedSize.height ? lockedSize : undefined,
      );
      releaseUploadUrl();
      uploadUrlRef.current = nextUrl;
      setDisplaySourceUrl(nextUrl);
      notify(`Replacement source loaded · locked ${canvasSizeLabel}`);
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      notify(error instanceof Error ? error.message : "Replacement image load nahi hui");
    }
  }

  return (
    <section className={styles.editor}>
      <div className={styles.heading}>
        <div>
          <b>Masterplan Mask & Lossless Exporter</b>
          <span>
            Crop/resize nahi hota. Original canvas dimensions lock rehte hain; sirf unwanted pixels
            transparent hote hain.
          </span>
        </div>
        <div className={styles.lockBadge}>
          <Check />
          <span>{canvasSizeLabel} locked</span>
        </div>
      </div>

      <div className={styles.safety}>
        <b>Geo-safe rule</b>
        <span>
          Outer field/background erase karein, lekin roads, boundary trees, amenities aur plot artwork
          rakhein. PNG export lossless + transparent hai. Browser WebP encoder max-quality hai; true
          lossless WebP guarantee ke liye future server encoder alag add hoga.
        </span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolRow}>
          <button
            type="button"
            className={tool === "erase" ? styles.activeTool : ""}
            onClick={() => setTool("erase")}
            disabled={disabled || busy || !ready}
          >
            <Eraser /> Cut brush
          </button>
          <button
            type="button"
            className={tool === "restore" ? styles.activeTool : ""}
            onClick={() => setTool("restore")}
            disabled={disabled || busy || !ready}
          >
            <RotateCcw /> Restore brush
          </button>
          <button
            type="button"
            className={tool === "keep" ? styles.activeTool : ""}
            onClick={() => setTool("keep")}
            disabled={disabled || busy || !ready}
          >
            <Scissors /> Keep polygon
          </button>
          <button
            type="button"
            className={tool === "pan" ? styles.activeTool : ""}
            onClick={() => setTool("pan")}
            disabled={disabled || busy || !ready || zoom <= 1}
          >
            <Move /> Pan
          </button>
        </div>

        <div className={styles.toolRow}>
          <button
            type="button"
            onClick={undo}
            disabled={disabled || busy || historyRef.current.length === 0}
          >
            <Undo2 /> Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={disabled || busy || redoRef.current.length === 0}
          >
            <Redo2 /> Redo
          </button>
          <button type="button" onClick={restoreAll} disabled={disabled || busy || !ready}>
            <RotateCcw /> Reset image
          </button>
          <label className={styles.uploadButton}>
            <Upload /> Same-size source
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={chooseReplacement}
              disabled={disabled || busy}
            />
          </label>
        </div>

        <div className={styles.adjustRow}>
          <label>
            <span>Brush {brushSize}px</span>
            <input
              type="range"
              min="8"
              max="240"
              step="4"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              disabled={disabled || busy || !ready}
            />
          </label>
          <div className={styles.zoomControls}>
            <button
              type="button"
              onClick={() => setZoomLevel(zoom - ZOOM_STEP)}
              disabled={disabled || zoom <= ZOOM_MIN}
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel(zoom + ZOOM_STEP)}
              disabled={disabled || zoom >= ZOOM_MAX}
            >
              +
            </button>
            <button type="button" onClick={resetView} disabled={disabled}>
              Fit
            </button>
          </div>
          <label className={styles.beforeToggle}>
            <input
              type="checkbox"
              checked={showBefore}
              onChange={(event) => setShowBefore(event.target.checked)}
              disabled={disabled || !ready}
            />
            Before
          </label>
        </div>
      </div>

      {tool === "keep" ? (
        <div className={styles.keepBar}>
          <span>
            Boundary ke andar points lagayein. Finish dabane par polygon ke bahar sab transparent
            hoga.
          </span>
          <button
            type="button"
            onClick={() => setKeepPoints([])}
            disabled={disabled || busy || keepPoints.length === 0}
          >
            Clear points
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={applyKeepPolygon}
            disabled={disabled || busy || keepPoints.length < 3}
          >
            Keep inside ({keepPoints.length})
          </button>
        </div>
      ) : null}

      <div
        className={`${styles.viewport} ${tool === "pan" ? styles.viewportPan : ""}`}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {!ready ? <div className={styles.loading}>Masterplan editor load ho raha hai…</div> : null}
        <div
          className={styles.surface}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          }}
        >
          <canvas
            ref={canvasRef}
            className={`${styles.canvas} ${showBefore ? styles.canvasHidden : ""}`}
            onPointerDown={beginCanvasPointer}
            onPointerMove={moveCanvasPointer}
            onPointerUp={endCanvasPointer}
            onPointerCancel={endCanvasPointer}
          />
          {showBefore ? (
            <img
              src={displaySourceUrl}
              alt="Original masterplan before mask"
              className={styles.beforeImage}
              draggable={false}
            />
          ) : null}
          {ready && keepPoints.length ? (
            <svg
              className={styles.keepOverlay}
              viewBox={`0 0 ${lockedSize.width} ${lockedSize.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                points={keepPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="rgba(124, 99, 255, 0.08)"
                stroke="#c7bfff"
                strokeWidth={Math.max(1, lockedSize.width / 900)}
                vectorEffect="non-scaling-stroke"
              />
              {keepPoints.map((point, index) => (
                <circle
                  key={`${point.x}-${point.y}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={Math.max(4, lockedSize.width / 350)}
                  fill="#ffcb45"
                  stroke="#071221"
                  strokeWidth={Math.max(1, lockedSize.width / 1200)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          ) : null}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.dimensionCheck}>
          <b>Output dimension lock</b>
          <span>
            Original {canvasSizeLabel} → Export {canvasSizeLabel} · no crop · no resize
            {edited ? " · mask edited" : " · original pixels"}
          </span>
        </div>
        <div className={styles.exportActions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void applyPreview()}
            disabled={disabled || busy || !ready}
          >
            <Check /> Apply masked map preview
          </button>
          <button
            type="button"
            onClick={() => void downloadPng()}
            disabled={disabled || busy || !ready}
          >
            <Download /> PNG lossless
          </button>
          <button
            type="button"
            onClick={() => void downloadWebp()}
            disabled={disabled || busy || !ready}
          >
            <Download /> WebP max quality
          </button>
        </div>
      </div>
    </section>
  );
}
