import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
const COOKIE="tiyansh_admin";const enc=new TextEncoder();const cfg=()=>env as unknown as Record<string,string>;const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function signature(exp:string){const key=await crypto.subtle.importKey("raw",bytes(cfg().SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,enc.encode(`admin:${exp}`));return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/g,"")}
export async function validAdminSession(){const token=(await cookies()).get(COOKIE)?.value;if(!token)return false;const [exp,sig]=token.split(".");if(!exp||!sig||Number(exp)<Date.now())return false;return sig===await signature(exp)}
export async function requireAdminSession(){if(!(await validAdminSession()))redirect("/admin/login")}
export async function sessionCookie(){const exp=String(Date.now()+8*60*60*1000);return `${COOKIE}=${exp}.${await signature(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`}
export const clearSessionCookie=()=>`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export async function verifyPassword(password:string){const salt=bytes(cfg().ADMIN_PASSWORD_SALT),expected=bytes(cfg().ADMIN_PASSWORD_HASH);const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const actual=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},key,256));if(actual.length!==expected.length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];return diff===0}
export const adminEmail=()=>cfg().ADMIN_EMAIL.toLowerCase();
