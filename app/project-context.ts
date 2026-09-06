import { env } from "cloudflare:workers";

export const DEFAULT_PROJECT_ID="tiyansh-prime-square";

export function requestHost(request:Request){
  return (request.headers.get("host")||new URL(request.url).host).toLowerCase().split(":")[0];
}

export async function publicProjectId(request:Request){
  const host=requestHost(request);
  const row=await env.DB.prepare("SELECT id FROM projects WHERE public_host = ? AND status = 'active' LIMIT 1").bind(host).first<{id:string}>();
  return row?.id||DEFAULT_PROJECT_ID;
}
