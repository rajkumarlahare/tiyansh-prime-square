import { env } from "cloudflare:workers";
import { hashAdminPassword,requireSuperAdmin } from "../../../admin-auth";

const unauthorized=()=>Response.json({error:"Super Admin access required"},{status:403});
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type UserRow={id:string;email:string;name:string;role:string;status:string;mustChangePassword:number;createdAt:string;updatedAt:string;lastLoginAt:string|null;projectId:string;projectName:string;publicHost:string|null;adminHost:string|null};
const cleanHost=(value:unknown)=>String(value||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"")||null;
const slugify=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"project";
const clientAdminUrl=()=>((env as unknown as Record<string,string>).CLIENT_ADMIN_ORIGIN||"https://tiyansh-prime-square.ai-8f3.workers.dev").replace(/\/$/,"")+"/admin/login";

export async function GET(){
  if(!(await requireSuperAdmin()))return unauthorized();
  const result=await env.DB.prepare("SELECT u.id, u.email, u.name, u.role, u.status, u.must_change_password AS mustChangePassword, u.created_at AS createdAt, u.updated_at AS updatedAt, u.last_login_at AS lastLoginAt, p.id AS projectId, p.name AS projectName, p.public_host AS publicHost, p.admin_host AS adminHost FROM admin_users u JOIN projects p ON p.id=u.project_id ORDER BY u.created_at DESC").all<UserRow>();
  return Response.json({users:result.results,clientAdminUrl:clientAdminUrl()},{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
  if(!(await requireSuperAdmin()))return unauthorized();
  const body=await request.json().catch(()=>({})) as {email?:string;name?:string;password?:string;projectName?:string;publicHost?:string;adminHost?:string};
  const email=String(body.email||"").trim().toLowerCase(),name=String(body.name||"").trim(),password=String(body.password||""),projectName=String(body.projectName||"").trim(),publicHost=cleanHost(body.publicHost),adminHost=cleanHost(body.adminHost);
  if(!emailPattern.test(email)||name.length<2||name.length>80||projectName.length<2||projectName.length>100||password.length<12||password.length>128)return Response.json({error:"Project name, valid email aur 12+ character password required"},{status:400});
  const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM admin_users").first<{total:number}>();
  if((count?.total||0)>=100)return Response.json({error:"Maximum 100 client admins allowed"},{status:409});
  const ownerEmail=(env as unknown as Record<string,string>).ADMIN_EMAIL?.toLowerCase();
  if(email===ownerEmail)return Response.json({error:"Owner email client account me use nahi ho sakta"},{status:409});
  const existing=await env.DB.prepare("SELECT id FROM admin_users WHERE email = ? LIMIT 1").bind(email).first();
  if(existing)return Response.json({error:"Is email ka account pehle se hai"},{status:409});
  const id=crypto.randomUUID(),projectId=crypto.randomUUID(),now=new Date().toISOString(),hash=await hashAdminPassword(password),slug=`${slugify(projectName)}-${projectId.slice(0,6)}`;
  try{await env.DB.batch([
    env.DB.prepare("INSERT INTO projects (id,name,slug,public_host,admin_host,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)").bind(projectId,projectName,slug,publicHost,adminHost,now,now),
    env.DB.prepare("INSERT INTO admin_users (id,email,name,project_id,role,password_hash,password_salt,status,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,email,name,projectId,"client_admin",hash.passwordHash,hash.passwordSalt,"active",1,now,now)
  ])}catch(error){console.error("Client project create failed",error);return Response.json({error:"Email ya domain pehle se use ho raha hai"},{status:409})}
  return Response.json({user:{id,email,name,projectId,projectName,publicHost,adminHost,role:"client_admin",status:"active",mustChangePassword:true,createdAt:now,updatedAt:now,lastLoginAt:null},clientAdminUrl:clientAdminUrl()},{status:201});
}

export async function PATCH(request:Request){
  if(!(await requireSuperAdmin()))return unauthorized();
  const body=await request.json().catch(()=>({})) as {id?:string;action?:string;name?:string;password?:string;publicHost?:string;adminHost?:string};
  const id=String(body.id||""),action=String(body.action||""),now=new Date().toISOString();
  const current=await env.DB.prepare("SELECT id,status,project_id AS projectId FROM admin_users WHERE id = ? LIMIT 1").bind(id).first<{id:string;status:string;projectId:string}>();
  if(!current)return Response.json({error:"Client admin nahi mila"},{status:404});
  if(action==="toggle"){
    const status=current.status==="active"?"disabled":"active";
    await env.DB.batch([env.DB.prepare("UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?").bind(status,now,id),env.DB.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?").bind(status,now,current.projectId)]);
    return Response.json({ok:true,status});
  }
  if(action==="domains"){
    const publicHost=cleanHost(body.publicHost),adminHost=cleanHost(body.adminHost);
    try{await env.DB.prepare("UPDATE projects SET public_host = ?, admin_host = ?, updated_at = ? WHERE id = ?").bind(publicHost,adminHost,now,current.projectId).run()}catch{return Response.json({error:"Domain kisi aur project me use ho raha hai"},{status:409})}
    return Response.json({ok:true,publicHost,adminHost});
  }
  if(action==="rename"){
    const name=String(body.name||"").trim();if(name.length<2||name.length>80)return Response.json({error:"Valid name required"},{status:400});
    await env.DB.prepare("UPDATE admin_users SET name = ?, updated_at = ? WHERE id = ?").bind(name,now,id).run();
    return Response.json({ok:true,name});
  }
  if(action==="reset_password"){
    const password=String(body.password||"");if(password.length<12||password.length>128)return Response.json({error:"Password 12 se 128 characters ka hona chahiye"},{status:400});
    const hash=await hashAdminPassword(password);
    await env.DB.prepare("UPDATE admin_users SET password_hash = ?, password_salt = ?, must_change_password = 1, updated_at = ? WHERE id = ?").bind(hash.passwordHash,hash.passwordSalt,now,id).run();
    return Response.json({ok:true});
  }
  return Response.json({error:"Invalid action"},{status:400});
}

export async function DELETE(request:Request){
  if(!(await requireSuperAdmin()))return unauthorized();
  const id=new URL(request.url).searchParams.get("id");if(!id)return Response.json({error:"Missing id"},{status:400});
  const current=await env.DB.prepare("SELECT project_id AS projectId FROM admin_users WHERE id=?").bind(id).first<{projectId:string}>();
  if(!current)return Response.json({error:"Client admin nahi mila"},{status:404});
  await env.DB.batch([env.DB.prepare("DELETE FROM admin_users WHERE id = ?").bind(id),env.DB.prepare("UPDATE projects SET status='deleted', public_host=NULL, admin_host=NULL, updated_at=? WHERE id=?").bind(new Date().toISOString(),current.projectId)]);
  return Response.json({ok:true});
}
