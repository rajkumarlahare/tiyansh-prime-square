import { env } from "cloudflare:workers";
import { requireSuperAdmin, sameOrigin } from "../../admin-auth";
import { writeAudit } from "../../audit";

const denied = () =>
  Response.json({ error: "Super Admin access required" }, { status: 403 });
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
function cleanPlot(projectId:string,p:Record<string,unknown>,now:string){
  const id=String(p.id||"").trim().toUpperCase().slice(0,80),polygon=String(p.polygon||""),status=String(p.status||"available"),numbers=[Number(p.sqft),Number(p.sqm),Number(p.sqyd)];
  if(!id||(polygon&&!validPolygon(polygon))||!["available","booked","sold"].includes(status)||numbers.some(value=>!Number.isFinite(value)||value<0))return null;
  return {projectId,id,sqft:numbers[0],sqm:numbers[1],sqyd:numbers[2],dimensions:String(p.dimensions||"").slice(0,120),road:String(p.road||"").slice(0,160),polygon,status,notes:String(p.notes||"").slice(0,2000),featured:p.featured?1:0,updatedAt:now};
}

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return denied();
  const projectId = new URL(request.url).searchParams.get("projectId") || "";
  if (!(await projectExists(projectId)))
    return Response.json({ error: "Project नहीं मिला" }, { status: 404 });
  const [plots, settings] = await Promise.all([
    env.DB.prepare(
      "SELECT id,sqft,sqm,sqyd,dimensions,road,status,notes,featured,polygon FROM plots WHERE project_id=? ORDER BY id",
    )
      .bind(projectId)
      .all(),
    env.DB.prepare("SELECT key,value FROM settings WHERE project_id=?")
      .bind(projectId)
      .all<{ key: string; value: string }>(),
  ]);
  return Response.json(
    {
      plots: plots.results,
      settings: Object.fromEntries(
        settings.results.map((item) => [item.key, item.value]),
      ),
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
    const form = await request.formData(),
      projectId = String(form.get("projectId") || ""),
      kind = String(form.get("kind") || ""),
      file = form.get("file");
    if (!(await projectExists(projectId)))
      return Response.json({ error: "Project नहीं मिला" }, { status: 404 });
    const allowed =
      kind === "masterplan"
        ? ["image/jpeg", "image/png", "image/webp"]
        : kind === "sourcePdf"
          ? ["application/pdf"]
          : [];
    if (!(file instanceof File) || !allowed.includes(file.type))
      return Response.json(
        { error: "सही masterplan image या PDF चुनें" },
        { status: 400 },
      );
    const limit = kind === "masterplan" ? 15 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > limit)
      return Response.json({ error: "File बहुत बड़ी है" }, { status: 400 });
    await env.BUCKET.put(
      `projects/${projectId}/mapper/${kind}`,
      file.stream(),
      { httpMetadata: { contentType: file.type } },
    );
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO settings (project_id,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(project_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    )
      .bind(projectId, `${kind}Name`, file.name.slice(0, 240), now)
      .run();
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
    },
    projectId = String(body.projectId || ""),
    incoming = Array.isArray(body.plots) ? body.plots : body.plot ? [body.plot] : [];
  if (!(await projectExists(projectId)) || !incoming.length)
    return Response.json(
      { error: "Project या plot नहीं मिला" },
      { status: 404 },
    );
  if(incoming.length>50)return Response.json({error:"एक block में अधिकतम 50 plots रखें"},{status:400});
  const now = new Date().toISOString(),cleaned=incoming.map(plot=>cleanPlot(projectId,plot,now));
  if(cleaned.some(plot=>!plot))
    return Response.json({ error: "Plot data सही नहीं है" }, { status: 400 });
  const saved=cleaned.filter((plot):plot is NonNullable<typeof plot>=>Boolean(plot));
  await env.DB.batch(saved.map(plot=>env.DB.prepare("INSERT INTO plots (project_id,id,sqft,sqm,sqyd,dimensions,road,polygon,status,notes,featured,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET sqft=excluded.sqft,sqm=excluded.sqm,sqyd=excluded.sqyd,dimensions=excluded.dimensions,road=excluded.road,polygon=excluded.polygon,status=excluded.status,notes=excluded.notes,featured=excluded.featured,updated_at=excluded.updated_at").bind(plot.projectId,plot.id,plot.sqft,plot.sqm,plot.sqyd,plot.dimensions,plot.road,plot.polygon,plot.status,plot.notes,plot.featured,plot.updatedAt)));
  await writeAudit(
    actor,
    saved.length>1?"mapper.block_saved":saved[0].polygon ? "mapper.plot_saved" : "mapper.boundary_removed",
    projectId,
    saved.length===1?saved[0].id:null,
    { count:saved.length,ids:saved.map(plot=>plot.id) },
  );
  return Response.json({
    ok: true,
    plot: saved[0],
    plots:saved,
  });
}
