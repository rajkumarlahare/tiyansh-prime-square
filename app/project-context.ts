import { env } from "cloudflare:workers";

export const DEFAULT_PROJECT_ID="tiyansh-prime-square";

export function requestHost(request:Request){
  return (request.headers.get("host")||new URL(request.url).host).toLowerCase().split(":")[0];
}

export async function publicProjectId(request:Request):Promise<string|null>{
  const host=requestHost(request);
  const row=await env.DB.prepare("SELECT id FROM projects WHERE public_host = ? AND status = 'active' LIMIT 1").bind(host).first<{id:string}>();
  if(row?.id)return row.id;
  const fallback=((env as unknown as Record<string,string>).CLIENT_FALLBACK_HOST||"tiyansh-prime-square.ai-8f3.workers.dev").toLowerCase();
  const requested=new URL(request.url).searchParams.get("projectId");
  if(requested){
    const preview=await env.DB.prepare("SELECT id,admin_host AS adminHost FROM projects WHERE id=? AND status='active' LIMIT 1").bind(requested).first<{id:string;adminHost:string|null}>();
    if(preview?.id&&(host===fallback||preview.adminHost===host))return preview.id;
  }
  return host===fallback?DEFAULT_PROJECT_ID:null;
}
export async function projectHostRole(hostValue:string){const host=hostValue.toLowerCase().split(":")[0];const row=await env.DB.prepare("SELECT id,public_host AS publicHost,admin_host AS adminHost FROM projects WHERE (public_host=? OR admin_host=?) AND status='active' LIMIT 1").bind(host,host).first<{id:string;publicHost:string|null;adminHost:string|null}>();if(row)return {projectId:row.id,role:row.adminHost===host?"admin" as const:"public" as const};const fallback=((env as unknown as Record<string,string>).CLIENT_FALLBACK_HOST||"tiyansh-prime-square.ai-8f3.workers.dev").toLowerCase();return host===fallback?{projectId:DEFAULT_PROJECT_ID,role:"public" as const}:null}
