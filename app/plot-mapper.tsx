"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Hand,
  ImagePlus,
  Maximize2,
  MousePointer2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

type Point = [number, number];
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
};

const MAX_MASTERPLAN_BYTES = 900_000;
const COMPLETED_PROJECT_ID = "tiyansh-prime-square";
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 2133;

async function apiResult(response: Response) {
  const raw = await response.text();
  let result: Record<string, unknown> = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    /* Cloudflare can return plain-text errors. */
  }
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : response.status === 413
          ? "File बहुत बड़ी है। छोटी file चुनें।"
          : raw.trim() || `Request failed (${response.status})`,
    );
  }
  return result;
}

/**
 * Every editable customer masterplan is normalized to the same 1200x2133
 * coordinate surface used by the public 2D/3D engine. The source image keeps
 * its aspect ratio and is letterboxed instead of stretched.
 */
async function normalizeMasterplan(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Image process नहीं हो पाई");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  const scale = Math.min(MAP_WIDTH / bitmap.width, MAP_HEIGHT / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const x = Math.round((MAP_WIDTH - width) / 2);
  const y = Math.round((MAP_HEIGHT - height) / 2);
  context.drawImage(bitmap, x, y, width, height);
  bitmap.close();

  const encode = (quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );

  let blob = await encode(0.84);
  for (const quality of [0.72, 0.6, 0.5]) {
    if (!blob || blob.size <= MAX_MASTERPLAN_BYTES) break;
    blob = await encode(quality);
  }
  if (!blob) throw new Error("इस image format को browser process नहीं कर पाया");

  return new File(
    [blob],
    `${file.name.replace(/\.[^.]+$/, "") || "masterplan"}.webp`,
    { type: "image/webp" },
  );
}

function nextPlotId(value: string) {
  const source = value.trim().toUpperCase();
  const match = source.match(/^(.*?)(\d+)$/);
  if (!match) return source ? `${source}-2` : "A-01";
  return `${match[1]}${String(Number(match[2]) + 1).padStart(match[2].length, "0")}`;
}

function suggestedPlotId(plots: Plot[]) {
  if (!plots.length) return "A-01";
  const ordered = [...plots].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  return nextPlotId(ordered[ordered.length - 1].id);
}

function polygonCenter(points: Point[]) {
  if (!points.length) return [0.5, 0.5] as Point;
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ] as Point;
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
  const [points, setPoints] = useState<Point[]>([]);
  const [shape, setShape] = useState<"rectangle" | "polygon">("rectangle");
  const [phase, setPhase] = useState<"select" | "details">("select");
  const [editingId, setEditingId] = useState("");
  const [plotId, setPlotId] = useState("A-01");
  const [dimensions, setDimensions] = useState("");
  const [sqft, setSqft] = useState("");
  const [road, setRoad] = useState("");
  const [zoom, setZoom] = useState(1);
  const [navigate, setNavigate] = useState(false);
  const [imageUrl, setImageUrl] = useState(() => assetUrl("masterplan"));
  const [imageReady, setImageReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setImageReady(false);
    fetch(`/api/super-mapper?projectId=${encodeURIComponent(projectId)}`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!active) return;
        const mapped = (data.plots || []).filter((plot: Plot) => plot.polygon);
        const nextSettings = (data.settings || {}) as MapperSettings;
        setPlots(mapped);
        setSettings(nextSettings);
        setPlotId(suggestedPlotId(mapped));
        setImageUrl(assetUrl("masterplan"));
      })
      .catch(() => notify("Project mapper data load नहीं हुआ"));
    return () => {
      active = false;
    };
    // projectId is also the component key in the Super Admin dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const draft = useMemo(() => {
    if (shape === "rectangle" && points.length === 2) {
      return [
        [points[0][0], points[0][1]],
        [points[1][0], points[0][1]],
        [points[1][0], points[1][1]],
        [points[0][0], points[1][1]],
      ] as Point[];
    }
    return points;
  }, [points, shape]);

  const hasMasterplan = completedProject || Boolean(settings.masterplanName);
  const hasPdf = Boolean(settings.sourcePdfName);
  const boundaryReady = draft.length >= 3;

  function mapPoint(event: React.PointerEvent<SVGSVGElement>) {
    if (navigate || phase !== "select" || !imageReady || completedProject) return;
    const box = event.currentTarget.getBoundingClientRect();
    const point: Point = [
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    ];

    if (shape === "rectangle") {
      setPoints((current) => {
        if (!current.length) return [point];
        setPhase("details");
        return [current[0], point];
      });
      return;
    }
    setPoints((current) => (current.length < 80 ? [...current, point] : current));
  }

  function resetCurrent(nextId = plotId) {
    setPoints([]);
    setPhase("select");
    setEditingId("");
    setPlotId(nextId);
    setDimensions("");
    setSqft("");
    setRoad("");
    setNavigate(false);
  }

  async function upload(file: File, kind: "masterplan" | "sourcePdf") {
    setBusy(true);
    try {
      if (kind === "sourcePdf" && file.size > 25 * 1024 * 1024) {
        throw new Error("PDF 25 MB से छोटी रखें");
      }
      const uploadFile =
        kind === "masterplan" ? await normalizeMasterplan(file) : file;
      const data = new FormData();
      data.append("projectId", projectId);
      data.append("kind", kind);
      data.append("file", uploadFile);
      const response = await fetch("/api/super-mapper", {
        method: "POST",
        body: data,
      });
      const result = await apiResult(response);
      if (kind === "masterplan") {
        setImageReady(false);
        setImageUrl(String(result.url));
        setSettings((current) => ({
          ...current,
          masterplanName: file.name,
        }));
        resetCurrent(suggestedPlotId(plots));
        notify("Masterplan तैयार है — अब पहला plot select करें");
      } else {
        setSettings((current) => ({ ...current, sourcePdfName: file.name }));
        notify("Technical PDF reference save हो गया");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Upload नहीं हुआ");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPlot() {
    const id = plotId.trim().toUpperCase();
    const area = Number(sqft);
    if (!id) {
      notify("Plot number जरूरी है");
      return;
    }
    if (!boundaryReady) {
      notify("पहले plot की पूरी boundary select करें");
      return;
    }
    if (!Number.isFinite(area) || area <= 0) {
      notify("Plot area sq.ft में भरें");
      return;
    }
    if (!dimensions.trim()) {
      notify("Plot dimensions भरें");
      return;
    }
    if (!editingId && plots.some((plot) => plot.id === id)) {
      notify(`${id} पहले से mapped है। List से Edit चुनें।`);
      return;
    }

    const plot: Plot = {
      id,
      sqft: area,
      sqm: area / 10.7639,
      sqyd: area / 9,
      dimensions: dimensions.trim(),
      road: road.trim(),
      status: plots.find((item) => item.id === editingId)?.status || "available",
      polygon: JSON.stringify(draft),
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
      setPlots((current) => [
        ...current.filter((item) => item.id !== editingId && item.id !== saved.id),
        saved,
      ]);
      const nextId = nextPlotId(saved.id);
      resetCurrent(nextId);
      notify(`Plot ${saved.id} confirm — site पर clickable + 3D ready. अब ${nextId} select करें`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Plot save नहीं हुआ");
    } finally {
      setBusy(false);
    }
  }

  function editPlot(plot: Plot) {
    try {
      const polygon = JSON.parse(plot.polygon || "[]") as Point[];
      if (!Array.isArray(polygon) || polygon.length < 3) throw new Error();
      setEditingId(plot.id);
      setPlotId(plot.id);
      setDimensions(plot.dimensions || "");
      setSqft(String(plot.sqft || ""));
      setRoad(plot.road || "");
      setShape("polygon");
      setPoints(polygon);
      setPhase("details");
      setNavigate(false);
      notify(`Plot ${plot.id} edit mode`);
      canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      notify("इस plot की boundary edit नहीं हो पाई");
    }
  }

  async function remove(plot: Plot) {
    if (!confirm(`Plot ${plot.id} की clickable boundary हटाएँ?`)) return;
    const cleared = { ...plot, polygon: "" };
    setBusy(true);
    try {
      const response = await fetch("/api/super-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, plot: cleared }),
      });
      await apiResult(response);
      const remaining = plots.filter((item) => item.id !== plot.id);
      setPlots(remaining);
      resetCurrent(suggestedPlotId(remaining));
      notify(`Plot ${plot.id} boundary हट गई`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Boundary नहीं हटी");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mapper-shell guided-mapper">
      <div className="card mapper-tools">
        <div className="section-title">
          <MousePointer2 />
          <div>
            <h2>Guided Plot Mapper</h2>
            <p>Upload → plot select → details → Confirm → अगला plot</p>
          </div>
        </div>

        <div className="mapper-steps" aria-label="Plot mapping workflow">
          <span className={hasMasterplan ? "done" : "active"}><b>1</b>Masterplan</span>
          <span className={phase === "select" && hasMasterplan ? "active" : boundaryReady ? "done" : ""}><b>2</b>Select plot</span>
          <span className={phase === "details" ? "active" : ""}><b>3</b>Plot details</span>
          <span><b>4</b>Next automatically</span>
        </div>

        <div className="mapper-upload-grid">
          <label className={`mapper-upload-card ${hasMasterplan ? "ready" : ""}`}>
            <span><ImagePlus /></span>
            <div>
              <b>{completedProject ? "Tiyansh masterplan locked" : hasMasterplan ? "Masterplan image ready" : "Upload masterplan image"}</b>
              <small>{completedProject ? "Completed project सुरक्षित है" : settings.masterplanName || "JPG / PNG / WebP · auto normalized for 2D + 3D"}</small>
            </div>
            {!completedProject && <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "masterplan")} />}
            {hasMasterplan && <CheckCircle2 className="mapper-ready-icon" />}
          </label>

          <label className={`mapper-upload-card ${hasPdf ? "ready" : ""}`}>
            <span><FileText /></span>
            <div>
              <b>{hasPdf ? "Technical PDF saved" : "Upload technical PDF"}</b>
              <small>{settings.sourcePdfName || "Optional reference · up to 25 MB"}</small>
            </div>
            <input type="file" accept="application/pdf" disabled={busy} onChange={(event) => event.target.files?.[0] && upload(event.target.files[0], "sourcePdf")} />
            {hasPdf && <CheckCircle2 className="mapper-ready-icon" />}
          </label>
        </div>

        {hasPdf && (
          <a className="mapper-pdf-link" href={assetUrl("sourcePdf")} target="_blank" rel="noreferrer">
            <FileText /> Open technical PDF reference
          </a>
        )}

        {!completedProject && hasMasterplan && (
          <div className="guided-current-card">
            <div className="guided-current-head">
              <div>
                <small>{editingId ? "EDITING PLOT" : `PLOT ${plots.length + 1}`}</small>
                <h3>{plotId || "New plot"}</h3>
              </div>
              <em className={phase}>{phase === "select" ? "Boundary select करें" : "Details भरें और Confirm करें"}</em>
            </div>

            {phase === "select" ? (
              <>
                <div className="mapper-mode">
                  <button className={shape === "rectangle" ? "active" : ""} onClick={() => { setShape("rectangle"); setPoints([]); }}>
                    Rectangle · 2 taps
                  </button>
                  <button className={shape === "polygon" ? "active" : ""} onClick={() => { setShape("polygon"); setPoints([]); }}>
                    Irregular · corner taps
                  </button>
                </div>
                <div className="mapper-actions compact">
                  <button disabled={!points.length} onClick={() => setPoints((current) => current.slice(0, -1))}><Undo2 />Undo</button>
                  <button disabled={!points.length} onClick={() => setPoints([])}>Clear</button>
                  {shape === "polygon" && <button className="primary" disabled={points.length < 3} onClick={() => setPhase("details")}><CheckCircle2 />Boundary complete</button>}
                </div>
                <small className="mapper-help">
                  {shape === "rectangle" ? "Plot के 2 opposite corners tap करें। दूसरा tap होते ही details step खुल जाएगा।" : "Plot के हर corner पर क्रम से tap करें, फिर Boundary complete दबाएँ।"}
                </small>
              </>
            ) : (
              <>
                <div className="mapper-fields guided-fields">
                  <label><span>Plot number</span><input value={plotId} onChange={(event) => setPlotId(event.target.value)} placeholder="A-01" /></label>
                  <label><span>Dimensions</span><input value={dimensions} onChange={(event) => setDimensions(event.target.value)} placeholder="40' × 85'" /></label>
                  <label><span>Area (sq.ft)</span><input type="number" min="0" value={sqft} onChange={(event) => setSqft(event.target.value)} placeholder="3400" /></label>
                  <label><span>Road access</span><input value={road} onChange={(event) => setRoad(event.target.value)} placeholder="40' wide road" /></label>
                </div>
                <div className="mapper-actions">
                  <button onClick={() => setPhase("select")}><Pencil />Boundary बदलें</button>
                  <button className="primary mapper-confirm" disabled={busy || !boundaryReady} onClick={confirmPlot}><Save />{busy ? "Saving…" : editingId ? `Update ${plotId || "plot"}` : `Confirm ${plotId || "plot"} & start next`}</button>
                </div>
                <small className="mapper-help">Confirm होते ही यह plot database में save होकर customer site के 2D map और 3D view दोनों में clickable हो जाएगा।</small>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mapper-work">
        <div ref={canvasRef} className={`mapper-canvas card ${navigate ? "pan-mode" : ""}`}>
          <div className="mapper-zoombar">
            <button className={!navigate ? "active" : ""} onClick={() => setNavigate(false)}><MousePointer2 />Select</button>
            <button className={navigate ? "active" : ""} onClick={() => setNavigate(true)}><Hand />Move image</button>
            <span>{Math.round(zoom * 100)}%</span>
            <input className="mapper-zoom-range" type="range" min="1" max="6" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom level" />
            <button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}><ZoomOut /></button>
            <button aria-label="Zoom in" disabled={zoom >= 6} onClick={() => setZoom((value) => Math.min(6, value + 0.5))}><ZoomIn /></button>
            <button aria-label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw /></button>
            <button aria-label="Full screen" onClick={() => canvasRef.current?.requestFullscreen?.()}><Maximize2 /></button>
          </div>

          {!imageReady && <div className="mapper-loading">{hasMasterplan ? "Masterplan load हो रहा है…" : "पहले masterplan image upload करें"}</div>}
          <div className="mapper-image-wrap" style={{ width: `${zoom * 100}%`, maxWidth: "none" }}>
            <img src={imageUrl} alt="Project masterplan" onLoad={() => setImageReady(true)} onError={() => setImageReady(false)} style={{ width: "100%", maxHeight: "none" }} />
            {imageReady && (
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={navigate ? undefined : mapPoint}>
                {plots.map((plot) => {
                  let polygon: Point[] = [];
                  try { polygon = JSON.parse(plot.polygon || "[]") as Point[]; } catch { return null; }
                  if (polygon.length < 3) return null;
                  const center = polygonCenter(polygon);
                  return <g key={plot.id} className={editingId === plot.id ? "mapped-plot editing" : "mapped-plot"}>
                    <polygon points={polygon.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")} />
                    <text x={center[0] * 1000} y={center[1] * 1000}>{plot.id}</text>
                  </g>;
                })}
                {draft.length > 0 && <polygon className="draft" points={draft.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ")} />}
              </svg>
            )}
            {imageReady && points.map(([x, y], index) => <span className="mapper-point-handle" key={`${x}-${y}-${index}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>{index + 1}</span>)}
          </div>
        </div>

        <aside className="card mapper-list">
          <h3>Confirmed plots <b>{plots.length}</b></h3>
          {plots.length ? [...plots].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).map((plot) => (
            <article key={plot.id}>
              <span><b>{plot.id}</b><small>{plot.dimensions || `${plot.sqft} sq.ft`}</small></span>
              {!completedProject && <div className="mapper-list-actions">
                <button className="edit" onClick={() => editPlot(plot)} aria-label={`Edit ${plot.id}`}><Pencil /></button>
                <button onClick={() => remove(plot)} aria-label={`Remove ${plot.id}`}><Trash2 /></button>
              </div>}
            </article>
          )) : <p>अभी कोई plot confirm नहीं हुआ।</p>}
        </aside>
      </div>
    </section>
  );
}
