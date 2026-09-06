import { env } from "cloudflare:workers";
import { hashAdminPassword,requireSuperAdmin } from "../../../admin-auth";

const unauthorized=()=>Response.json({error:"Super Admin access required"},{status:403});
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type UserRow={id:string;email:string;name:string;role:string;status:string;mustChangePassword:number;createdAt:string;updatedAt:string;lastLoginAt:string|null};

export async function GET(){
  if(!(await requireSuperAdmin()))return unauthorized();
  const result=await env.DB.prepare("SELECT id, email, name, role, status, must_change_password AS mustChangePassword, created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt FROM admin_users ORDER BY created_at DESC").all<UserRow>();
  return Response.json({users:result.results},{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
  if(!(await requireSuperAdmin()))return unauthorized();
  const body=await request.json().catch(()=>({})) as {email?:string;name?:string;password?:string};
  const email=String(body.email||"").trim().toLowerCase(),name=String(body.name||"").trim(),password=String(body.password||"");
  if(!emailPattern.test(email)||name.length<2||name.length>80||password.length<12||password.length>128)return Response.json({error:"Valid name, email aur 12+ character password required"},{status:400});
  const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM admin_users").first<{total:number}>();
  if((count?.total||0)>=100)return Response.json({error:"Maximum 100 client admins allowed"},{status:409});
  const ownerEmail=(env as unknown as Record<string,string>).ADMIN_EMAIL?.toLowerCase();
  if(email===ownerEmail)return Response.json({error:"Owner email client account me use nahi ho sakta"},{status:409});
  const existing=await env.DB.prepare("SELECT id FROM admin_users WHERE email = ? LIMIT 1").bind(email).first();
  if(existing)return Response.json({error:"Is email ka account pehle se hai"},{status:409});
  const id=crypto.randomUUID(),now=new Date().toISOString(),hash=await hashAdminPassword(password);
  await env.DB.prepare("INSERT INTO admin_users (id,email,name,role,password_hash,password_salt,status,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,email,name,"client_admin",hash.passwordHash,hash.passwordSalt,"active",1,now,now).run();
  return Response.json({user:{id,email,name,role:"client_admin",status:"active",mustChangePassword:true,createdAt:now,updatedAt:now,lastLoginAt:null}},{status:201});
}

export async function PATCH(request:Request){
  if(!(await requireSuperAdmin()))return unauthorized();
  const body=await request.json().catch(()=>({})) as {id?:string;action?:string;name?:string;password?:string};
  const id=String(body.id||""),action=String(body.action||""),now=new Date().toISOString();
  const current=await env.DB.prepare("SELECT id,status FROM admin_users WHERE id = ? LIMIT 1").bind(id).first<{id:string;status:string}>();
  if(!current)return Response.json({error:"Client admin nahi mila"},{status:404});
  if(action==="toggle"){
    const status=current.status==="active"?"disabled":"active";
    await env.DB.prepare("UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?").bind(status,now,id).run();
    return Response.json({ok:true,status});
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
  await env.DB.prepare("DELETE FROM admin_users WHERE id = ?").bind(id).run();
  return Response.json({ok:true});
}
