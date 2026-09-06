import { env } from "cloudflare:workers";
import { hashAdminPassword,requireSuperAdmin,sameOrigin } from "../../../admin-auth";

const unauthorized=()=>Response.json({error:"Super Admin access required"},{status:403});
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hostPattern=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
type UserRow={id:string;email:string;name:string;role:string;status:string;mustChangePassword:number;createdAt:string;updatedAt:string;lastLoginAt:string|null;projectId:string;projectName:string;publicHost:string|null;adminHost:string|null};
const cleanHost=(value:unknown)=>{const host=String(value||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*/,"").replace(/\.$/,"");return host||null};
const validHost=(host:string|null)=>!host||hostPattern.test(host);
const slugify=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"project";
const clientAdminUrl=()=>((env as unknown as Record<string,string>).CLIENT_ADMIN_ORIGIN||"https://tiyansh-prime-square.ai-8f3.workers.dev").replace(/\/$/,"")+"/admin/login";
async function audit(actor:{id:string;email:string},action:string,projectId:string|null,targetId:string|null,details:Record<string,unknown>={}){await env.DB.prepare("INSERT INTO audit_logs (id,actor_id,actor_email,action,project_id,target_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,actor.email,action,projectId,targetId,JSON.stringify(details),new Date().toISOString()).run()}

export async function GET(){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();
  const [result,projects,audits]=await Promise.all([
    env.DB.prepare("SELECT u.id,u.email,u.name,u.role,u.status,u.must_change_password AS mustChangePassword,u.created_at AS createdAt,u.updated_at AS updatedAt,u.last_login_at AS lastLoginAt,p.id AS projectId,p.name AS projectName,p.public_host AS publicHost,p.admin_host AS adminHost FROM admin_users u JOIN projects p ON p.id=u.project_id WHERE p.status!='deleted' ORDER BY u.created_at DESC").all<UserRow>(),
    env.DB.prepare("SELECT p.id,p.name,p.slug,p.public_host AS publicHost,p.admin_host AS adminHost,p.status,COUNT(u.id) AS adminCount FROM projects p LEFT JOIN admin_users u ON u.project_id=p.id WHERE p.status!='deleted' GROUP BY p.id ORDER BY p.created_at DESC").all(),
    env.DB.prepare("SELECT action,actor_email AS actorEmail,project_id AS projectId,target_id AS targetId,created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 50").all()
  ]);
  return Response.json({users:result.results,projects:projects.results,audits:audits.results,clientAdminUrl:clientAdminUrl()},{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const body=await request.json().catch(()=>({})) as {email?:string;name?:string;password?:string;projectId?:string;projectName?:string;publicHost?:string;adminHost?:string};
  const email=String(body.email||"").trim().toLowerCase(),name=String(body.name||"").trim(),password=String(body.password||""),projectName=String(body.projectName||"").trim(),publicHost=cleanHost(body.publicHost),adminHost=cleanHost(body.adminHost);
  if(!emailPattern.test(email)||name.length<2||name.length>80||password.length<12||password.length>128||!validHost(publicHost)||!validHost(adminHost))return Response.json({error:"Valid name, email, domains aur 12+ character password required"},{status:400});
  if(email===(env as unknown as Record<string,string>).ADMIN_EMAIL?.toLowerCase())return Response.json({error:"Owner email client account me use nahi ho sakta"},{status:409});
  if(await env.DB.prepare("SELECT id FROM admin_users WHERE email=? LIMIT 1").bind(email).first())return Response.json({error:"Is email ka account pehle se hai"},{status:409});
  let projectId=String(body.projectId||"").trim(),resolvedName=projectName;
  if(projectId){const project=await env.DB.prepare("SELECT id,name,status FROM projects WHERE id=? AND status!='deleted' LIMIT 1").bind(projectId).first<{id:string;name:string;status:string}>();if(!project)return Response.json({error:"Existing project nahi mila"},{status:404});resolvedName=project.name;if(await env.DB.prepare("SELECT id FROM admin_users WHERE project_id=? LIMIT 1").bind(projectId).first())return Response.json({error:"Is project ka client admin pehle se bana hai"},{status:409})}
  else {if(projectName.length<2||projectName.length>100)return Response.json({error:"Project name required"},{status:400});projectId=crypto.randomUUID()}
  const id=crypto.randomUUID(),now=new Date().toISOString(),hash=await hashAdminPassword(password),slug=`${slugify(resolvedName)}-${projectId.slice(0,6)}`;
  try{const statements=[];if(!body.projectId)statements.push(env.DB.prepare("INSERT INTO projects (id,name,slug,public_host,admin_host,status,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?)").bind(projectId,resolvedName,slug,publicHost,adminHost,now,now));else if(publicHost||adminHost)statements.push(env.DB.prepare("UPDATE projects SET public_host=COALESCE(?,public_host),admin_host=COALESCE(?,admin_host),updated_at=? WHERE id=?").bind(publicHost,adminHost,now,projectId));statements.push(env.DB.prepare("INSERT INTO admin_users (id,email,name,project_id,role,password_hash,password_salt,status,must_change_password,session_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,email,name,projectId,"client_admin",hash.passwordHash,hash.passwordSalt,"active",1,1,now,now));await env.DB.batch(statements)}catch(error){console.error("Client project create failed",error);return Response.json({error:"Email ya domain pehle se use ho raha hai"},{status:409})}
  await audit(actor,"client.created",projectId,id,{email,projectName:resolvedName,publicHost,adminHost});
  return Response.json({user:{id,email,name,projectId,projectName:resolvedName,publicHost,adminHost,role:"client_admin",status:"active",mustChangePassword:true,createdAt:now,updatedAt:now,lastLoginAt:null},clientAdminUrl:clientAdminUrl()},{status:201});
}

export async function PATCH(request:Request){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const body=await request.json().catch(()=>({})) as {id?:string;action?:string;name?:string;password?:string;publicHost?:string;adminHost?:string},id=String(body.id||""),action=String(body.action||""),now=new Date().toISOString();
  const current=await env.DB.prepare("SELECT id,status,project_id AS projectId FROM admin_users WHERE id=? LIMIT 1").bind(id).first<{id:string;status:string;projectId:string}>();if(!current)return Response.json({error:"Client admin nahi mila"},{status:404});
  if(action==="toggle"){const status=current.status==="active"?"disabled":"active";await env.DB.batch([env.DB.prepare("UPDATE admin_users SET status=?,session_version=session_version+1,updated_at=? WHERE id=?").bind(status,now,id),env.DB.prepare("UPDATE projects SET status=?,updated_at=? WHERE id=?").bind(status,now,current.projectId)]);await audit(actor,`client.${status}`,current.projectId,id);return Response.json({ok:true,status})}
  if(action==="domains"){const publicHost=cleanHost(body.publicHost),adminHost=cleanHost(body.adminHost);if(!validHost(publicHost)||!validHost(adminHost))return Response.json({error:"Valid domain लिखें, https:// या path नहीं"},{status:400});try{await env.DB.prepare("UPDATE projects SET public_host=?,admin_host=?,updated_at=? WHERE id=?").bind(publicHost,adminHost,now,current.projectId).run()}catch{return Response.json({error:"Domain kisi aur project me use ho raha hai"},{status:409})}await audit(actor,"project.domains_updated",current.projectId,id,{publicHost,adminHost});return Response.json({ok:true,publicHost,adminHost})}
  if(action==="rename"){const name=String(body.name||"").trim();if(name.length<2||name.length>80)return Response.json({error:"Valid name required"},{status:400});await env.DB.prepare("UPDATE admin_users SET name=?,updated_at=? WHERE id=?").bind(name,now,id).run();await audit(actor,"client.renamed",current.projectId,id);return Response.json({ok:true,name})}
  if(action==="reset_password"){const password=String(body.password||"");if(password.length<12||password.length>128)return Response.json({error:"Password 12 se 128 characters ka hona chahiye"},{status:400});const hash=await hashAdminPassword(password);await env.DB.prepare("UPDATE admin_users SET password_hash=?,password_salt=?,must_change_password=1,session_version=session_version+1,updated_at=? WHERE id=?").bind(hash.passwordHash,hash.passwordSalt,now,id).run();await audit(actor,"client.password_reset",current.projectId,id);return Response.json({ok:true})}
  return Response.json({error:"Invalid action"},{status:400});
}

export async function DELETE(request:Request){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const id=new URL(request.url).searchParams.get("id");if(!id)return Response.json({error:"Missing id"},{status:400});
  const current=await env.DB.prepare("SELECT project_id AS projectId FROM admin_users WHERE id=?").bind(id).first<{projectId:string}>();if(!current)return Response.json({error:"Client admin nahi mila"},{status:404});
  const objects=await env.BUCKET.list({prefix:`projects/${current.projectId}/`});if(objects.objects.length)await Promise.all(objects.objects.map(object=>env.BUCKET.delete(object.key)));
  await env.DB.batch([env.DB.prepare("DELETE FROM gallery WHERE project_id=?").bind(current.projectId),env.DB.prepare("DELETE FROM plots WHERE project_id=?").bind(current.projectId),env.DB.prepare("DELETE FROM settings WHERE project_id=?").bind(current.projectId),env.DB.prepare("DELETE FROM admin_users WHERE id=?").bind(id),env.DB.prepare("UPDATE projects SET status='deleted',public_host=NULL,admin_host=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(),current.projectId)]);
  await audit(actor,"client.deleted",current.projectId,id);return Response.json({ok:true});
}
