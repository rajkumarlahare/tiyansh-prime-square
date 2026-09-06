import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

const COOKIE="tiyansh_admin";
const enc=new TextEncoder(),dec=new TextDecoder();
const cfg=()=>env as unknown as Record<string,string>;
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64url=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const fromB64url=(value:string)=>bytes(value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4));

export type AdminRole="super_admin"|"client_admin";
export type AdminSession={id:string;name:string;email:string;role:AdminRole;exp:number};

async function signature(body:string){
  const key=await crypto.subtle.importKey("raw",bytes(cfg().SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(body))));
}

async function verifyPassword(password:string,saltB64:string,hashB64:string){
  const salt=bytes(saltB64),expected=bytes(hashB64);
  const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const actual=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256));
  if(actual.length!==expected.length)return false;
  let diff=0;for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];
  return diff===0;
}

export async function hashAdminPassword(password:string){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
  const hash=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256));
  return {passwordSalt:btoa(String.fromCharCode(...salt)),passwordHash:btoa(String.fromCharCode(...hash))};
}

export async function authenticateAdmin(email:string,password:string):Promise<AdminSession|null>{
  const normalized=email.trim().toLowerCase(),now=Date.now();
  if(normalized===cfg().ADMIN_EMAIL?.toLowerCase()&&await verifyPassword(password,cfg().ADMIN_PASSWORD_SALT,cfg().ADMIN_PASSWORD_HASH))return {id:"owner",name:"Super Admin",email:normalized,role:"super_admin",exp:now+8*60*60*1000};
  const row=await env.DB.prepare("SELECT id, email, name, role, password_hash AS passwordHash, password_salt AS passwordSalt, status FROM admin_users WHERE email = ? LIMIT 1").bind(normalized).first<{id:string;email:string;name:string;role:AdminRole;passwordHash:string;passwordSalt:string;status:string}>();
  if(!row||row.status!=="active"||!(await verifyPassword(password,row.passwordSalt,row.passwordHash)))return null;
  const timestamp=new Date().toISOString();
  await env.DB.prepare("UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(timestamp,timestamp,row.id).run();
  return {id:row.id,name:row.name,email:row.email,role:row.role,exp:now+8*60*60*1000};
}

export async function getAdminSession():Promise<AdminSession|null>{
  const token=(await cookies()).get(COOKIE)?.value;if(!token)return null;
  const [body,sig]=token.split(".");if(!body||!sig||sig!==await signature(body))return null;
  let session:AdminSession;try{session=JSON.parse(dec.decode(fromB64url(body))) as AdminSession}catch{return null}
  if(!session.id||!session.email||!session.role||session.exp<Date.now())return null;
  if(session.role==="super_admin"&&session.id==="owner")return session;
  const row=await env.DB.prepare("SELECT name, email, role, status FROM admin_users WHERE id = ? LIMIT 1").bind(session.id).first<{name:string;email:string;role:AdminRole;status:string}>();
  if(!row||row.status!=="active"||row.email!==session.email)return null;
  return {...session,name:row.name,role:row.role};
}

export async function validAdminSession(){return getAdminSession()}
export async function requireAdminSession(){const session=await getAdminSession();if(!session)redirect("/admin/login");return session}
export async function requireSuperAdmin(){const session=await getAdminSession();return session?.role==="super_admin"?session:null}
export async function sessionCookie(session:AdminSession){const body=b64url(enc.encode(JSON.stringify(session)));return `${COOKIE}=${body}.${await signature(body)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`}
export const clearSessionCookie=()=>`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
