"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  ImagePlus,
  Hand,
  MousePointer2,
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

const MAX_MASTERPLAN_BYTES = 900_000;
async function apiResult(response: Response) {
  const raw = await response.text();
  let result: Record<string, unknown> = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    /* Cloudflare can return a plain-text 413 page. */
  }
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : response.status === 413
          ? "Image बहुत बड़ी है। छोटी image चुनें या screenshot upload करें।"
          : raw.trim() || `Request failed (${response.status})`,
    );
  return result;
}
async function optimizeMasterplan(file: File) {
  if (file.size <= MAX_MASTERPLAN_BYTES) return file;
  const bitmap = await createImageBitmap(file),
    pixelScale = Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)),
    scale = Math.min(
      1,
      2200 / Math.max(bitmap.width, bitmap.height),
      pixelScale,
    ),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Image optimize नहीं हो पाई");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
  let blob = await encode(0.82);
  if (blob && blob.size > MAX_MASTERPLAN_BYTES) blob = await encode(0.66);
  if (!blob) throw new Error("इस image format को browser process नहीं कर पाया");
  return new File(
    [blob],
    `${file.name.replace(/\.[^.]+$/, "") || "masterplan"}.webp`,
    { type: "image/webp" },
  );
}

function numberedId(start: string, offset: number) {
  const match = start
    .trim()
    .toUpperCase()
    .match(/^(.*?)(\d+)$/);
  if (!match)
    return offset
      ? `${start.trim().toUpperCase()}-${offset + 1}`
      : start.trim().toUpperCase();
  const value = Math.max(0, Number(match[2]) + offset);
  return `${match[1]}${String(value).padStart(match[2].length, "0")}`;
}
function splitBlock(points: Point[], count: number) {
  if (points.length !== 4 || count < 2) return [];
  const mix = (a: Point, b: Point, t: number): Point => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  return Array.from({ length: count }, (_, index) => {
    const from = index / count,
      to = (index + 1) / count;
    return [
      mix(points[0], points[1], from),
      mix(points[0], points[1], to),
      mix(points[3], points[2], to),
      mix(points[3], points[2], from),
    ] as Point[];
  });
}

export default function PlotMapper({
  notify,
  projectId,
}: {
  notify: (message: string) => void;
  projectId: string;
}) {
  const assetUrl = (kind: string) =>
    `/api/project-asset/${kind}?projectId=${encodeURIComponent(projectId)}`;
  const [plots, setPlots] = useState<Plot[]>([]),
    [points, setPoints] = useState<Point[]>([]),
    [mode, setMode] = useState<"block" | "rectangle" | "polygon">("block"),
    [plotId, setPlotId] = useState(""),
    [dimensions, setDimensions] = useState(""),
    [sqft, setSqft] = useState(""),
    [road, setRoad] = useState(""),
    [blockCount, setBlockCount] = useState("6"),
    [numberStep, setNumberStep] = useState<1 | -1>(1),
    [zoom, setZoom] = useState(1),
    [navigate, setNavigate] = useState(false),
    [imageUrl, setImageUrl] = useState(() => assetUrl("masterplan")),
    [imageReady, setImageReady] = useState(false),
    [busy, setBusy] = useState(false),
    [pdfName, setPdfName] = useState("");
  const imageRef = useRef<HTMLImageElement | null>(null);
  // projectId is also the component key, so switching projects remounts this editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch(`/api/super-mapper?projectId=${encodeURIComponent(projectId)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setPlots((data.plots || []).filter((p: Plot) => p.polygon));
        setPdfName(data.settings?.sourcePdfName || "");
      })
      .catch(() => notify("Project mapper data load नहीं हुआ"));
  }, [projectId]);
  const draft = useMemo(
    () =>
      mode === "rectangle" && points.length === 2
        ? ([
            [points[0][0], points[0][1]],
            [points[1][0], points[0][1]],
            points[1],
            [points[0][0], points[1][1]],
          ] as Point[])
        : points,
    [mode, points],
  );
  const blockDrafts = useMemo(
    () =>
      mode === "block"
        ? splitBlock(points, Math.min(50, Math.max(2, Number(blockCount) || 2)))
        : [],
    [mode, points, blockCount],
  );
  function point(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect(),
      p: [number, number] = [
        (event.clientX - box.left) / box.width,
        (event.clientY - box.top) / box.height,
      ];
    if (mode === "block") {
      setPoints((current) => (current.length >= 4 ? [p] : [...current, p]));
    } else if (mode === "rectangle") {
      setPoints((current) => (current.length >= 2 ? [p] : [...current, p]));
    } else
      setPoints((current) => (current.length < 80 ? [...current, p] : current));
  }
  async function upload(file: File, kind: "masterplan" | "sourcePdf") {
    setBusy(true);
    try {
      const uploadFile =
        kind === "masterplan" ? await optimizeMasterplan(file) : file;
      if (kind === "sourcePdf" && file.size > 8_000_000)
        throw new Error("PDF 8 MB से छोटी रखें");
      const data = new FormData();
      data.append("projectId", projectId);
      data.append("kind", kind);
      data.append("file", uploadFile);
      const r = await fetch("/api/super-mapper", {
          method: "POST",
          body: data,
        }),
        j = await apiResult(r);
      if (kind === "masterplan") {
        setImageReady(false);
        setImageUrl(String(j.url));
      } else setPdfName(file.name);
      notify(
        kind === "masterplan"
          ? "Masterplan optimize होकर तैयार है"
          : "Technical PDF reference save हो गया",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Upload नहीं हुआ");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const id = plotId.trim().toUpperCase();
    if (mode === "block") {
      if (!id || blockDrafts.length < 2) {
        notify("पहला plot number दें और block के चारों outer corners tap करें");
        return;
      }
      const area = Number(sqft) || 0;
      const batch = blockDrafts.map((polygon, index): Plot => ({
        id: numberedId(id, index * numberStep),
        sqft: area,
        sqm: area / 10.7639,
        sqyd: area / 9,
        dimensions: dimensions.trim(),
        road: road.trim(),
        status: "available",
        polygon: JSON.stringify(polygon),
      }));
      setBusy(true);
      try {
        const response = await fetch("/api/super-mapper", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ projectId, plots: batch }),
          }),
          result = await apiResult(response),
          saved = result.plots as Plot[];
        setPlots((current) => [
          ...current.filter(
            (item) => !saved.some((plot) => plot.id === item.id),
          ),
          ...saved,
        ]);
        setPoints([]);
        setPlotId(numberedId(id, batch.length * numberStep));
        notify(`${batch.length} plots एक साथ clickable बन गए`);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Block save नहीं हुआ");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!id || draft.length < 3) {
      notify("Plot number और पूरी boundary जरूरी है");
      return;
    }
    const area = Number(sqft) || 0,
      plot: Plot = {
        id,
        sqft: area,
        sqm: area / 10.7639,
        sqyd: area / 9,
        dimensions: dimensions.trim(),
        road: road.trim(),
        status: "available",
        polygon: JSON.stringify(draft),
      };
    setBusy(true);
    try {
      const r = await fetch("/api/super-mapper", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId, plot }),
        }),
        j = await apiResult(r);
      setPlots((current) => [
        ...current.filter((p) => p.id !== id),
        j.plot as Plot,
      ]);
      setPoints([]);
      setPlotId("");
      setDimensions("");
      setSqft("");
      setRoad("");
      notify(`Plot ${id} clickable बन गया`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Plot save नहीं हुआ");
    } finally {
      setBusy(false);
    }
  }
  async function remove(plot: Plot) {
    if (!confirm(`Plot ${plot.id} की clickable boundary हटाएँ?`)) return;
    const cleared = { ...plot, polygon: "" };
    setBusy(true);
    try {
      const r = await fetch("/api/super-mapper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, plot: cleared }),
      });
      if (!r.ok) throw new Error();
      setPlots((current) => current.filter((p) => p.id !== plot.id));
      notify("Boundary हटा दी गई");
    } catch {
      notify("Boundary नहीं हटी");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mapper-shell">
      <div className="card mapper-tools">
        <div className="section-title">
          <MousePointer2 />
          <div>
            <h2>Plot Mapper Engine</h2>
            <p>Masterplan पर tap करके clickable plots बनाइए</p>
          </div>
        </div>
        <div className="mapper-upload-row">
          <label className="mapper-upload">
            <ImagePlus />
            {busy ? "Processing…" : "3D masterplan"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) =>
                e.target.files?.[0] && upload(e.target.files[0], "masterplan")
              }
            />
          </label>
          <label className="mapper-upload">
            <FileText />
            Technical PDF
            <input
              type="file"
              accept="application/pdf"
              disabled={busy}
              onChange={(e) =>
                e.target.files?.[0] && upload(e.target.files[0], "sourcePdf")
              }
            />
          </label>
          {pdfName && (
            <a href={assetUrl("sourcePdf")} target="_blank" rel="noreferrer">
              Open {pdfName}
            </a>
          )}
        </div>
        <div className="mapper-mode">
          <button
            className={mode === "block" ? "active" : ""}
            onClick={() => {
              setMode("block");
              setPoints([]);
            }}
          >
            Block Auto: 4 taps
          </button>
          <button
            className={mode === "rectangle" ? "active" : ""}
            onClick={() => {
              setMode("rectangle");
              setPoints([]);
            }}
          >
            Rectangle: 2 taps
          </button>
          <button
            className={mode === "polygon" ? "active" : ""}
            onClick={() => {
              setMode("polygon");
              setPoints([]);
            }}
          >
            Polygon: corner taps
          </button>
        </div>
        <div className="mapper-fields">
          <input
            value={plotId}
            onChange={(e) => setPlotId(e.target.value)}
            placeholder="Plot no. A-01"
          />
          <input
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="Dimensions 40×85"
          />
          <input
            type="number"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            placeholder="Area sq.ft"
          />
          <input
            value={road}
            onChange={(e) => setRoad(e.target.value)}
            placeholder="Road access"
          />
          {mode === "block" && (
            <>
              <input
                type="number"
                min="2"
                max="50"
                value={blockCount}
                onChange={(e) => setBlockCount(e.target.value)}
                placeholder="Plots in block"
                aria-label="Plots in block"
              />
              <select
                value={numberStep}
                onChange={(e) =>
                  setNumberStep(Number(e.target.value) as 1 | -1)
                }
                aria-label="Number direction"
              >
                <option value="1">Numbering +1</option>
                <option value="-1">Numbering −1</option>
              </select>
            </>
          )}
        </div>
        <div className="mapper-actions">
          <button
            disabled={!points.length}
            onClick={() => setPoints((current) => current.slice(0, -1))}
          >
            <Undo2 />
            Undo point
          </button>
          <button disabled={!points.length} onClick={() => setPoints([])}>
            Clear
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              (mode === "block" ? blockDrafts.length < 2 : draft.length < 3)
            }
            onClick={save}
          >
            <Save />
            {mode === "block"
              ? `Save ${blockDrafts.length || Number(blockCount) || 0} plots together`
              : "Save clickable plot"}
          </button>
        </div>
        <small className="mapper-help">
          {mode === "block"
            ? "Block Auto: numbering जिस दिशा में चाहिए, उस block के start-left → end-left → end-right → start-right corners tap करें।"
            : "Rectangle mode में 2 opposite corners tap करें। Irregular plot के लिए Polygon mode चुनें।"}
        </small>
      </div>
      <div className="mapper-work">
        <div className={`mapper-canvas card ${navigate ? "pan-mode" : ""}`}>
          <div className="mapper-zoombar">
            <button className={!navigate ? "active" : ""} onClick={()=>setNavigate(false)}><MousePointer2/>Map points</button>
            <button className={navigate ? "active" : ""} onClick={()=>setNavigate(true)}><Hand/>Move image</button>
            <span>{Math.round(zoom*100)}%</span>
            <button aria-label="Zoom out" disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.5))}><ZoomOut/></button>
            <button aria-label="Zoom in" disabled={zoom>=6} onClick={()=>setZoom(value=>Math.min(6,value+.5))}><ZoomIn/></button>
            <button aria-label="Reset zoom" onClick={()=>setZoom(1)}><RotateCcw/></button>
          </div>
          {!imageReady && (
            <div className="mapper-loading">
              Masterplan upload करें या image load होने दें…
            </div>
          )}
          <div className="mapper-image-wrap" style={{width:`${zoom*100}%`,maxWidth:"none"}}>
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Project masterplan"
              onLoad={() => setImageReady(true)}
              onError={() => setImageReady(false)}
              style={{width:"100%",maxHeight:"none"}}
            />
            {imageReady && (
              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                onPointerDown={navigate ? undefined : point}
              >
                {plots.map((plot) => {
                  const p = JSON.parse(plot.polygon || "[]") as Point[];
                  return (
                    <polygon
                      key={plot.id}
                      points={p
                        .map(([x, y]) => `${x * 1000},${y * 1000}`)
                        .join(" ")}
                    >
                      <title>{plot.id}</title>
                    </polygon>
                  );
                })}
                {blockDrafts.map((shape, index) => (
                  <polygon
                    key={`block-${index}`}
                    className="draft block-draft"
                    points={shape
                      .map(([x, y]) => `${x * 1000},${y * 1000}`)
                      .join(" ")}
                  >
                    <title>{numberedId(plotId, index * numberStep)}</title>
                  </polygon>
                ))}
                {mode !== "block" && draft.length > 0 && (
                  <polygon
                    className="draft"
                    points={draft
                      .map(([x, y]) => `${x * 1000},${y * 1000}`)
                      .join(" ")}
                  />
                )}{" "}
                {points.map(([x, y], i) => (
                  <circle
                    className="point"
                    key={i}
                    cx={x * 1000}
                    cy={y * 1000}
                    r="8"
                  />
                ))}
              </svg>
            )}
          </div>
        </div>
        <aside className="card mapper-list">
          <h3>
            Mapped plots <b>{plots.length}</b>
          </h3>
          {plots.length ? (
            plots
              .sort((a, b) =>
                a.id.localeCompare(b.id, undefined, { numeric: true }),
              )
              .map((plot) => (
                <article key={plot.id}>
                  <span>
                    <b>{plot.id}</b>
                    <small>{plot.dimensions || `${plot.sqft} sq.ft`}</small>
                  </span>
                  <button
                    onClick={() => remove(plot)}
                    aria-label={`Remove ${plot.id}`}
                  >
                    <Trash2 />
                  </button>
                </article>
              ))
          ) : (
            <p>अभी कोई clickable plot नहीं है।</p>
          )}
        </aside>
      </div>
    </section>
  );
}
