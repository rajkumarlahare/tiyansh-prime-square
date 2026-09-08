import { env } from "cloudflare:workers";
import { authenticateAdmin,sameOrigin,sessionCookie } from "../../../admin-auth";
const WINDOW=15*60*1000,MAX=5;
async function keyFor(request:Request,email:string){const ip=request.headers.get("cf-connecting-ip")||"unknown",raw=new TextEncoder().encode(`${ip}:${email}`),hash=await crypto.subtle.digest("SHA-256",raw);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("")}
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const body=await request.json().catch(()=>({})) as {email?:string,password?:string,projectId?:string,projectSlug?:string},email=String(body.email||"").trim().toLowerCase(),key=await keyFor(request,email),now=Date.now(),db=env.DB,host=(request.headers.get("host")||new URL(request.url).host).toLowerCase().split(":")[0];
  const row=await db.prepare("SELECT attempts, window_start AS windowStart FROM login_attempts WHERE key = ?").bind(key).first<{attempts:number;windowStart:number}>();
  if(row&&now-row.windowStart<WINDOW&&row.attempts>=MAX)return Response.json({error:"Too many attempts. 15 minutes बाद try करें।"},{status:429});
  const session=await authenticateAdmin(email,String(body.password||""),host,{projectId:String(body.projectId||""),projectSlug:String(body.projectSlug||"")});
  if(!session){if(!row||now-row.windowStart>=WINDOW)await db.prepare("INSERT INTO login_attempts (key, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts=1, window_start=excluded.window_start").bind(key,now).run();else await db.prepare("UPDATE login_attempts SET attempts=attempts+1 WHERE key=?").bind(key).run();return Response.json({error:"Email या password गलत है।"},{status:401})}
  await db.batch([db.prepare("DELETE FROM login_attempts WHERE key=?").bind(key),db.prepare("DELETE FROM login_attempts WHERE window_start < ?").bind(now-24*60*60*1000)]);
  return Response.json({ok:true,mustChangePassword:session.mustChangePassword,user:{name:session.name,email:session.email,role:session.role}},{headers:{"set-cookie":await sessionCookie(session),"cache-control":"no-store"}});
}
