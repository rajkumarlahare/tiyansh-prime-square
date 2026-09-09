import { env } from "cloudflare:workers";
import { authenticateAdmin,sameOrigin,sessionCookie } from "../../../admin-auth";

const WINDOW=15*60*1000,MAX=5;

type LoginInput={
  email?:string;
  password?:string;
  projectId?:string;
  projectSlug?:string;
  successPath?:string;
  changePasswordPath?:string;
  returnPath?:string;
};

async function keyFor(request:Request,email:string){
  const ip=request.headers.get("cf-connecting-ip")||"unknown",raw=new TextEncoder().encode(`${ip}:${email}`),hash=await crypto.subtle.digest("SHA-256",raw);
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

function formRequest(request:Request){
  const type=(request.headers.get("content-type")||"").toLowerCase();
  return type.includes("application/x-www-form-urlencoded")||type.includes("multipart/form-data");
}

async function loginInput(request:Request):Promise<{body:LoginInput;nativeForm:boolean}>{
  const nativeForm=formRequest(request);
  if(nativeForm){
    const form=await request.formData();
    return {nativeForm,body:{
      email:String(form.get("email")||""),
      password:String(form.get("password")||""),
      projectId:String(form.get("projectId")||""),
      projectSlug:String(form.get("projectSlug")||""),
      successPath:String(form.get("successPath")||""),
      changePasswordPath:String(form.get("changePasswordPath")||""),
      returnPath:String(form.get("returnPath")||""),
    }};
  }
  return {nativeForm:false,body:await request.json().catch(()=>({})) as LoginInput};
}

function safeInternalPath(value:unknown,fallback:string){
  const path=String(value||"").trim();
  if(!path.startsWith("/")||path.startsWith("//")||path.includes("\\")||/[\r\n\0]/.test(path))return fallback;
  return path;
}

function nativeRedirect(request:Request,path:string,errorCode?:string,headers?:HeadersInit){
  const target=new URL(safeInternalPath(path,"/admin/login"),request.url);
  if(errorCode)target.searchParams.set("loginError",errorCode);
  const responseHeaders=new Headers(headers);
  responseHeaders.set("location",target.toString());
  responseHeaders.set("cache-control","no-store");
  return new Response(null,{status:303,headers:responseHeaders});
}

function loginFailure(request:Request,nativeForm:boolean,returnPath:string,error:string,status:number,code:string){
  return nativeForm
    ? nativeRedirect(request,returnPath||"/admin/login",code)
    : Response.json({error},{status,headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
  const parsed=await loginInput(request);
  const body=parsed.body;
  const returnPath=safeInternalPath(body.returnPath,"/admin/login");

  if(!sameOrigin(request))return loginFailure(request,parsed.nativeForm,returnPath,"Invalid request origin",403,"origin");

  const email=String(body.email||"").trim().toLowerCase(),key=await keyFor(request,email),now=Date.now(),db=env.DB,host=(request.headers.get("host")||new URL(request.url).host).toLowerCase().split(":")[0];
  const row=await db.prepare("SELECT attempts, window_start AS windowStart FROM login_attempts WHERE key = ?").bind(key).first<{attempts:number;windowStart:number}>();

  if(row&&now-row.windowStart<WINDOW&&row.attempts>=MAX){
    return loginFailure(request,parsed.nativeForm,returnPath,"Too many attempts. 15 minutes baad try karein.",429,"rate");
  }

  const session=await authenticateAdmin(email,String(body.password||""),host,{projectId:String(body.projectId||""),projectSlug:String(body.projectSlug||"")});
  if(!session){
    if(!row||now-row.windowStart>=WINDOW)await db.prepare("INSERT INTO login_attempts (key, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts=1, window_start=excluded.window_start").bind(key,now).run();
    else await db.prepare("UPDATE login_attempts SET attempts=attempts+1 WHERE key=?").bind(key).run();
    return loginFailure(request,parsed.nativeForm,returnPath,"Email ya password galat hai.",401,"invalid");
  }

  await db.batch([
    db.prepare("DELETE FROM login_attempts WHERE key=?").bind(key),
    db.prepare("DELETE FROM login_attempts WHERE window_start < ?").bind(now-24*60*60*1000),
  ]);

  const cookie=await sessionCookie(session);
  if(parsed.nativeForm){
    const successPath=safeInternalPath(body.successPath,"/admin");
    const changePasswordPath=safeInternalPath(body.changePasswordPath,"/admin/change-password");
    return nativeRedirect(request,session.mustChangePassword?changePasswordPath:successPath,undefined,{"set-cookie":cookie});
  }

  return Response.json(
    {ok:true,mustChangePassword:session.mustChangePassword,user:{name:session.name,email:session.email,role:session.role}},
    {headers:{"set-cookie":cookie,"cache-control":"no-store"}},
  );
}
