import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../admin-auth";
import { writeAudit } from "../../audit";
import { parseCadGeometry } from "../../cad-import";
import { cleanPlotId, type HomographyPair } from "../../mapper-geometry";
import { parsePlotSheetText } from "../../plot-sheet";

const denied = () =>
  Response.json({ error: "Super Admin access required" }, { status: 403 });
const COMPLETED_PROJECT_ID = "tiyansh-prime-square";
const SETTINGS_WHITELIST = new Set([
  "mapWidth",
  "mapHeight",
  "masterplanOriginalWidth",
  "masterplanOriginalHeight",
  "cadBounds",
  "homography",
  "calibrationPairs",
  "calibrationError",
  "cadMatchedCount",
  "cadReviewCount",
  "publicRotation",
]);

async function projectExists(projectId: string) {
  return Boolean(
    await env.DB.prepare(
      "SELECT id FROM projects WHERE id=? AND status!='deleted' LIMIT 1",
    )
      .bind(projectId)
      .first(),
  );
}

function validPolygon(value: string) {
  try {
    const points = JSON.parse(value);
    return (
      Array.isArray(points) &&
      points.length >= 3 &&
      points.length <= 80 &&
      points.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every((v) => typeof v === "number" && v >= 0 && v <= 1),
      )
    );
  } catch {
    return false;
  }
}

function cleanPlot(projectId: string, p: Record<string, unknown>, now: string) {
  const id = cleanPlotId(String(p.id || "")),
    polygon = String(p.polygon || ""),
    status = String(p.status || "available"),
    numbers = [Number(p.sqft), Number(p.sqm), Number(p.sqyd)];
  if (
    !id ||
    (polygon && !validPolygon(polygon)) ||
    !["available", "booked", "sold"].includes(status) ||
    numbers.some((value) => !Number.isFinite(value) || value < 0)
  )
    return null;
  return {
    projectId,
    id,
    sqft: numbers[0],
    sqm: numbers[1],
    sqyd: numbers[2],
    dimensions: String(p.dimensions || "").slice(0, 120),
    road: String(p.road || "").slice(0, 160),
    polygon,
    status,
    notes: String(p.notes || "").slice(0, 2000),
    featured: p.featured ? 1 : 0,
    updatedAt: now,
  };
}

async function writeSetting(projectId: string, key: string, value: string, now: string) {
  await env.DB.prepare(
    "INSERT INTO settings (project_id,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(project_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  )
    .bind(projectId, key, value, now)
    .run();
}

async function deleteSettings(projectId: string, keys: string[]) {
  if (!keys.length) return;
  await env.DB.batch(
    keys.map((key) =>
      env.DB.prepare("DELETE FROM settings WHERE project_id=? AND key=?").bind(projectId, key),
    ),
  );
}

function validCalibrationPair(value: unknown): value is HomographyPair {
  if (!value || typeof value !== "object") return false;
  const pair = value as HomographyPair;
  const validPoint = (point: unknown) =>
    Array.isArray(point) &&
    point.length === 2 &&
    point.every((item) => Number.isFinite(item) && Number(item) >= 0 && Number(item) <= 1);
  return validPoint(pair.source) && validPoint(pair.target);
}

function validatedSetting(key: string, raw: unknown) {
  if (["mapWidth", "mapHeight", "masterplanOriginalWidth", "masterplanOriginalHeight"].includes(key)) {
    const number = Number(raw);
    if (!(number >= 100 && number <= 10000)) throw new Error(`${key} invalid hai`);
    return String(Math.round(number));
  }
  if (key === "publicRotation") {
    const number = Number(raw);
    if (!Number.isInteger(number) || number < 0 || number > 3)
      throw new Error("publicRotation invalid hai");
    return String(number);
  }
  if (["cadMatchedCount", "cadReviewCount"].includes(key)) {
    const number = Number(raw);
    if (!Number.isInteger(number) || number < 0 || number > 5000) throw new Error(`${key} invalid hai`);
    return String(number);
  }
  if (key === "calibrationError") {
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || number > 10) throw new Error("Calibration error invalid hai");
    return String(number);
  }
  if (key === "homography") {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed) || parsed.length !== 9 || !parsed.every(Number.isFinite))
      throw new Error("Homography matrix invalid hai");
    return JSON.stringify(parsed);
  }
  if (key === "calibrationPairs") {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed) || parsed.length < 4 || parsed.length > 12 || !parsed.every(validCalibrationPair))
      throw new Error("Calibration pairs invalid hain");
    return JSON.stringify(parsed);
  }
  if (key === "cadBounds") {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const bounds = parsed as Record<string, unknown> | null;
    if (
      !bounds ||
      !["minX", "minY", "maxX", "maxY"].every((name) => Number.isFinite(Number(bounds[name])))
    )
      throw new Error("CAD bounds invalid hain");
    return JSON.stringify(parsed);
  }
  const value = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (value.length > 12000) throw new Error(`${key} setting bahut badi hai`);
  return value;
}

async function savePlots(
  projectId: string,
  incoming: Record<string, unknown>[],
  preserveGeometry = false,
) {
  const now = new Date().toISOString();
  const cleaned = incoming.map((plot) => cleanPlot(projectId, plot, now));
  if (cleaned.some((plot) => !plot)) throw new Error("Plot data सही नहीं है");
  const saved = cleaned.filter((plot): plot is NonNullable<typeof plot> => Boolean(plot));
  const statement = preserveGeometry
    ? "INSERT INTO plots (project_id,id,sqft,sqm,sqyd,dimensions,road,polygon,status,notes,featured,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET sqft=excluded.sqft,sqm=excluded.sqm,sqyd=excluded.sqyd,dimensions=excluded.dimensions,road=excluded.road,notes=excluded.notes,updated_at=excluded.updated_at"
    : "INSERT INTO plots (project_id,id,sqft,sqm,sqyd,dimensions,road,polygon,status,notes,featured,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET sqft=excluded.sqft,sqm=excluded.sqm,sqyd=excluded.sqyd,dimensions=excluded.dimensions,road=excluded.road,polygon=excluded.polygon,status=excluded.status,notes=excluded.notes,featured=excluded.featured,updated_at=excluded.updated_at";

  for (let index = 0; index < saved.length; index += 80) {
    const chunk = saved.slice(index, index + 80);
    await env.DB.batch(
      chunk.map((plot) =>
        env.DB.prepare(statement).bind(
          plot.projectId,
          plot.id,
          plot.sqft,
          plot.sqm,
          plot.sqyd,
          plot.dimensions,
          plot.road,
          plot.polygon,
          plot.status,
          plot.notes,
          plot.featured,
          plot.updatedAt,
        ),
      ),
    );
  }
  return saved;
}

async function readCadGeometry(projectId: string) {
  const object = await env.BUCKET.get(`projects/${projectId}/mapper/cadGeometry`);
  if (!object) return null;
  try {
    return JSON.parse(await object.text());
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!(await projectExists(projectId)))
    return Response.json({ error: "Project नहीं मिला" }, { status: 404 });
  const [plots, settings, cadGeometry] = await Promise.all([
    env.DB.prepare(
      "SELECT id,sqft,sqm,sqyd,dimensions,road,status,notes,featured,polygon FROM plots WHERE project_id=? ORDER BY id",
    )
      .bind(projectId)
      .all(),
    env.DB.prepare("SELECT key,value FROM settings WHERE project_id=?")
      .bind(projectId)
      .all<{ key: string; value: string }>(),
    readCadGeometry(projectId),
  ]);
  return Response.json(
    {
      plots: plots.results,
      settings: Object.fromEntries(
        settings.results.map((item) => [item.key, item.value]),
      ),
      cadGeometry,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const projectId = String(form.get("projectId") || "");
    const kind = String(form.get("kind") || "");
    const file = form.get("file");
    if (projectId === COMPLETED_PROJECT_ID && ["masterplan", "sourceCad", "plotSheet"].includes(kind)) {
      return Response.json(
        { error: "Completed Tiyansh mapper locked है। नए काम के लिए नया project चुनें।" },
        { status: 409 },
      );
    }
    if (!(await projectExists(projectId)))
      return Response.json({ error: "Project नहीं मिला" }, { status: 404 });
    if (!(file instanceof File))
      return Response.json({ error: "File नहीं मिली" }, { status: 400 });

    const extension = file.name.toLowerCase().split(".").pop() || "";
    const valid =
      (kind === "masterplan" && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) ||
      (kind === "sourcePdf" && (file.type === "application/pdf" || extension === "pdf")) ||
      (kind === "sourceCad" && ["dwg", "dxf"].includes(extension)) ||
      (kind === "plotSheet" && ["csv", "json"].includes(extension));
    if (!valid)
      return Response.json(
        { error: "Image, PDF, DWG/DXF या CSV/JSON plot sheet सही format में चुनें" },
        { status: 400 },
      );

    const limits: Record<string, number> = {
      masterplan: 20 * 1024 * 1024,
      sourcePdf: 25 * 1024 * 1024,
      sourceCad: 25 * 1024 * 1024,
      plotSheet: 3 * 1024 * 1024,
    };
    if (file.size > (limits[kind] || 0))
      return Response.json({ error: "File बहुत बड़ी है" }, { status: 400 });

    const now = new Date().toISOString();
    const objectKey = `projects/${projectId}/mapper/${kind}`;

    if (kind === "masterplan") {
      const width = Math.round(Number(form.get("mapWidth")));
      const height = Math.round(Number(form.get("mapHeight")));
      const originalWidth = Math.round(Number(form.get("originalWidth")));
      const originalHeight = Math.round(Number(form.get("originalHeight")));
      if (!(width > 100 && height > 100 && width <= 10000 && height <= 10000)) {
        return Response.json({ error: "Masterplan dimensions invalid hain" }, { status: 400 });
      }
      const originalFile = form.get("originalFile");
      const publicFile = form.get("publicFile");
      const imageTypes = ["image/jpeg", "image/png", "image/webp"];
      if (
        originalFile instanceof File &&
        (!imageTypes.includes(originalFile.type) || originalFile.size > 40 * 1024 * 1024)
      )
        return Response.json({ error: "Original masterplan invalid hai" }, { status: 400 });
      if (
        publicFile instanceof File &&
        (!imageTypes.includes(publicFile.type) || publicFile.size > 4 * 1024 * 1024)
      )
        return Response.json({ error: "Public masterplan invalid hai" }, { status: 400 });

      const writes: Promise<unknown>[] = [
        env.BUCKET.put(objectKey, file.stream(), {
          httpMetadata: { contentType: file.type || "application/octet-stream" },
        }),
      ];
      if (originalFile instanceof File) {
        writes.push(
          env.BUCKET.put(`projects/${projectId}/mapper/masterplanOriginal`, originalFile.stream(), {
            httpMetadata: { contentType: originalFile.type || "application/octet-stream" },
          }),
        );
      }
      if (publicFile instanceof File) {
        writes.push(
          env.BUCKET.put(`projects/${projectId}/mapper/masterplanPublic`, publicFile.stream(), {
            httpMetadata: { contentType: publicFile.type || "application/octet-stream" },
          }),
        );
      } else {
        writes.push(
          env.BUCKET.put(`projects/${projectId}/mapper/masterplanPublic`, file.stream(), {
            httpMetadata: { contentType: file.type || "application/octet-stream" },
          }),
        );
      }
      await Promise.all(writes);
      await Promise.all([
        writeSetting(projectId, "masterplanName", file.name.slice(0, 240), now),
        writeSetting(
          projectId,
          "masterplanOriginalName",
          (originalFile instanceof File ? originalFile.name : file.name).slice(0, 240),
          now,
        ),
        writeSetting(projectId, "mapWidth", String(width), now),
        writeSetting(projectId, "mapHeight", String(height), now),
        writeSetting(projectId, "masterplanOriginalWidth", String(originalWidth || width), now),
        writeSetting(projectId, "masterplanOriginalHeight", String(originalHeight || height), now),
      ]);
      // A new render can have different perspective even with identical dimensions.
      // Keep already-published normalized polygons and inventory, but never reuse a
      // stale CAD->image calibration for future automatic publishes.
      await deleteSettings(projectId, [
        "homography",
        "calibrationPairs",
        "calibrationError",
        "cadMatchedCount",
        "cadReviewCount",
      ]);
      await writeAudit(actor, "mapper.masterplan_uploaded", projectId, null, {
        filename: file.name,
        originalFilename: originalFile instanceof File ? originalFile.name : file.name,
        size: file.size,
        width,
        height,
      });
      return Response.json({
        ok: true,
        name: file.name,
        mapWidth: width,
        mapHeight: height,
        url: `/api/project-asset/masterplan?projectId=${encodeURIComponent(projectId)}&v=${Date.now()}`,
      });
    }

    if (kind === "sourceCad") {
      await env.BUCKET.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      await writeSetting(projectId, "sourceCadName", file.name.slice(0, 240), now);
      await deleteSettings(projectId, [
        "homography",
        "calibrationPairs",
        "calibrationError",
        "cadMatchedCount",
        "cadReviewCount",
        "cadParseError",
        "cadBounds",
        "cadCandidateCount",
      ]);
      let geometry = null;
      let cadError = "";
      try {
        geometry = await parseCadGeometry(file);
        await env.BUCKET.put(
          `projects/${projectId}/mapper/cadGeometry`,
          JSON.stringify(geometry),
          { httpMetadata: { contentType: "application/json" } },
        );
        await Promise.all([
          writeSetting(projectId, "cadBounds", JSON.stringify(geometry.bounds), now),
          writeSetting(projectId, "cadCandidateCount", String(geometry.candidates.length), now),
        ]);
      } catch (error) {
        cadError = error instanceof Error ? error.message : "CAD auto-detect nahi hua";
        await env.BUCKET.delete(`projects/${projectId}/mapper/cadGeometry`);
        await writeSetting(projectId, "cadParseError", cadError.slice(0, 500), now);
        await writeSetting(projectId, "cadCandidateCount", "0", now);
      }
      await writeAudit(actor, "mapper.sourceCad_uploaded", projectId, null, {
        filename: file.name,
        size: file.size,
        candidates: geometry?.candidates.length || 0,
        cadError,
      });
      return Response.json({
        ok: true,
        name: file.name,
        cadGeometry: geometry,
        cadError,
      });
    }

    if (kind === "plotSheet") {
      let rows;
      try {
        rows = parsePlotSheetText(await file.text(), file.name);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Plot sheet parse nahi hui" },
          { status: 400 },
        );
      }
      if (!rows.length)
        return Response.json({ error: "Plot sheet me valid rows nahi mili" }, { status: 400 });
      if (rows.length > 2000)
        return Response.json({ error: "Ek project me adhiktam 2000 plot rows import karein" }, { status: 400 });
      // Store only after parsing succeeds, so a bad upload does not replace the
      // last known-good source sheet.
      await env.BUCKET.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type || "text/csv" },
      });
      await writeSetting(projectId, "plotSheetName", file.name.slice(0, 240), now);
      const saved = await savePlots(
        projectId,
        rows.map((row) => ({ ...row, polygon: "", status: "available", featured: false })),
        true,
      );
      await writeSetting(projectId, "plotSheetCount", String(saved.length), now);
      await writeAudit(actor, "mapper.plotSheet_imported", projectId, null, {
        filename: file.name,
        count: saved.length,
      });
      return Response.json({ ok: true, name: file.name, count: saved.length, plots: saved });
    }

    // Technical PDF and future ordinary mapper source assets.
    await env.BUCKET.put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    await writeSetting(projectId, `${kind}Name`, file.name.slice(0, 240), now);
    await writeAudit(actor, `mapper.${kind}_uploaded`, projectId, null, {
      filename: file.name,
      size: file.size,
    });
    return Response.json({
      ok: true,
      name: file.name,
      url: `/api/project-asset/${kind}?projectId=${encodeURIComponent(projectId)}&v=${Date.now()}`,
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    plot?: Record<string, unknown>;
    plots?: Record<string, unknown>[];
    settings?: Record<string, unknown>;
  };
  const projectId = String(body.projectId || "");
  if (!(await projectExists(projectId)))
    return Response.json({ error: "Project नहीं मिला" }, { status: 404 });
  if (projectId === COMPLETED_PROJECT_ID)
    return Response.json({ error: "Completed Tiyansh mapper locked है" }, { status: 409 });

  if (body.settings && typeof body.settings === "object") {
    const entries = Object.entries(body.settings).filter(([key]) => SETTINGS_WHITELIST.has(key));
    if (!entries.length)
      return Response.json({ error: "Mapper settings invalid हैं" }, { status: 400 });
    const now = new Date().toISOString();
    try {
      for (const [key, raw] of entries) {
        await writeSetting(projectId, key, validatedSetting(key, raw), now);
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Mapper settings invalid hain" },
        { status: 400 },
      );
    }
    await writeAudit(actor, "mapper.calibration_saved", projectId, null, {
      keys: entries.map(([key]) => key),
    });
    return Response.json({ ok: true });
  }

  const incoming = Array.isArray(body.plots) ? body.plots : body.plot ? [body.plot] : [];
  if (!incoming.length)
    return Response.json({ error: "Plot नहीं मिला" }, { status: 404 });
  if (incoming.length > 500)
    return Response.json({ error: "एक request में अधिकतम 500 plots रखें" }, { status: 400 });
  let saved;
  try {
    saved = await savePlots(projectId, incoming);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Plot data सही नहीं है" },
      { status: 400 },
    );
  }
  await writeAudit(
    actor,
    saved.length > 1
      ? "mapper.auto_plots_saved"
      : saved[0].polygon
        ? "mapper.plot_saved"
        : "mapper.boundary_removed",
    projectId,
    saved.length === 1 ? saved[0].id : null,
    { count: saved.length, ids: saved.map((plot) => plot.id) },
  );
  return Response.json({ ok: true, plot: saved[0], plots: saved });
}
