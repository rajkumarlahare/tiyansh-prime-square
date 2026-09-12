import { env } from "cloudflare:workers";
import { hashAdminPassword,requireSuperAdmin,sameOrigin } from "../../../admin-auth";
import { writeAudit } from "../../../audit";
import { upsertPrimaryProjectDomain } from "../../../project-domains";
import { provisionClientAccess } from "../../../project-provisioning";
import { clientFallbackHost } from "../../../project-context";
import { currentProjectLinks } from "../../../project-links";
import { validClientPassword } from "../../../client-password-policy";

const unauthorized=()=>Response.json({error:"Super Admin access required"},{status:403});
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hostPattern=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
type UserRow={id:string;email:string;name:string;role:string;status:string;mustChangePassword:number;createdAt:string;updatedAt:string;lastLoginAt:string|null;projectId:string;projectName:string;projectSlug:string;publicHost:string|null;adminHost:string|null};
const cleanHost=(value:unknown)=>{const host=String(value||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*/,"").replace(/\.$/,"");return host||null};
const validHost=(host:string|null)=>!host||hostPattern.test(host);
const slugify=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"project";
const clientAdminUrl=(slug="",adminHost?:string|null)=>slug?currentProjectLinks(slug,null,adminHost).adminUrl:`https://${clientFallbackHost()}/admin/login`;
const isGeoLab=async(projectId:string)=>Boolean(await env.DB.prepare("SELECT 1 FROM projects WHERE id=? AND kind='geo_lab' AND status!='deleted' LIMIT 1").bind(projectId).first());

export async function GET(){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();
  const [result,projects,audits,archived]=await Promise.all([
    env.DB.prepare("SELECT u.id,u.email,u.name,u.role,u.status,u.must_change_password AS mustChangePassword,u.created_at AS createdAt,u.updated_at AS updatedAt,u.last_login_at AS lastLoginAt,p.id AS projectId,p.name AS projectName,p.slug AS projectSlug,p.public_host AS publicHost,p.admin_host AS adminHost FROM admin_users u JOIN projects p ON p.id=u.project_id WHERE p.status!='deleted' ORDER BY u.created_at DESC").all<UserRow>(),
    env.DB.prepare("SELECT p.id,p.name,p.slug,p.kind,p.public_host AS publicHost,p.admin_host AS adminHost,p.status,p.deleted_at AS deletedAt,COUNT(u.id) AS adminCount FROM projects p LEFT JOIN admin_users u ON u.project_id=p.id WHERE p.status!='deleted' GROUP BY p.id ORDER BY p.created_at DESC").all(),
    env.DB.prepare("SELECT action,actor_email AS actorEmail,project_id AS projectId,target_id AS targetId,created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT p.id,p.name,p.kind,p.status,p.deleted_at AS deletedAt,COUNT(u.id) AS adminCount FROM projects p LEFT JOIN admin_users u ON u.project_id=p.id WHERE p.status='deleted' GROUP BY p.id ORDER BY p.deleted_at DESC,p.updated_at DESC").all()
  ]);
  return Response.json({users:result.results.map(user=>({...user,adminUrl:clientAdminUrl(user.projectSlug,user.adminHost)})),projects:projects.results,archivedProjects:archived.results,audits:audits.results,clientAdminUrl:clientAdminUrl()},{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const body=await request.json().catch(()=>({})) as {email?:string;name?:string;password?:string;projectId?:string;projectName?:string;publicHost?:string;adminHost?:string};
  const email=String(body.email||"").trim().toLowerCase(),name=String(body.name||"").trim(),password=String(body.password||""),projectName=String(body.projectName||"").trim(),publicHost=cleanHost(body.publicHost),adminHost=cleanHost(body.adminHost);
  if(!emailPattern.test(email)||name.length<2||name.length>80||!validClientPassword(password)||!validHost(publicHost)||!validHost(adminHost))return Response.json({error:"Valid details aur 8+ character password with letter + number required"},{status:400});
  if(email===(env as unknown as Record<string,string>).ADMIN_EMAIL?.toLowerCase())return Response.json({error:"Owner email client account me use nahi ho sakta"},{status:409});
  if(await env.DB.prepare("SELECT id FROM admin_users WHERE email=? LIMIT 1").bind(email).first())return Response.json({error:"Is email ka account pehle se hai"},{status:409});
  let projectId=String(body.projectId||"").trim(),resolvedName=projectName,resolvedSlug="";
  if(projectId){const project=await env.DB.prepare("SELECT id,name,slug,status FROM projects WHERE id=? AND status!='deleted' LIMIT 1").bind(projectId).first<{id:string;name:string;slug:string;status:string}>();if(!project)return Response.json({error:"Existing project nahi mila"},{status:404});resolvedName=project.name;resolvedSlug=project.slug}
  else {if(projectName.length<2||projectName.length>100)return Response.json({error:"Project name required"},{status:400});projectId=crypto.randomUUID()}
  const id=crypto.randomUUID(),now=new Date().toISOString(),hash=await hashAdminPassword(password),slug=resolvedSlug||`${slugify(resolvedName)}-${projectId.slice(0,6)}`;
  try{
    await provisionClientAccess({
      createProject: !body.projectId,
      projectId,
      projectName: resolvedName,
      projectSlug: slug,
      adminId: id,
      email,
      name,
      password: hash,
      actor,
      auditDetails: {email,projectName: resolvedName,publicHost,adminHost},
      publicHost,
      adminHost,
      now,
    });
  }catch(error){
    console.error("Client project create failed",error);
    return Response.json({error:"Email, project slug ya domain pehle se use ho raha hai"},{status:409});
  }
  return Response.json({user:{id,email,name,projectId,projectName:resolvedName,projectSlug:slug,publicHost,adminHost,role:"client_admin",status:"active",mustChangePassword:true,createdAt:now,updatedAt:now,lastLoginAt:null,adminUrl:clientAdminUrl(slug,adminHost)},clientAdminUrl:clientAdminUrl(slug,adminHost)},{status:201});
}

export async function PATCH(request:Request){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const body=await request.json().catch(()=>({})) as {id?:string;projectId?:string;action?:string;name?:string;password?:string;publicHost?:string;adminHost?:string},id=String(body.id||""),action=String(body.action||""),now=new Date().toISOString();
  if(action==="restore_project"){const projectId=String(body.projectId||"").trim();if(!projectId)return Response.json({error:"Project required"},{status:400});const project=await env.DB.prepare("SELECT id,name FROM projects WHERE id=? AND status='deleted' LIMIT 1").bind(projectId).first<{id:string;name:string}>();if(!project)return Response.json({error:"Archived project nahi mila"},{status:404});await env.DB.prepare("UPDATE projects SET status='active',deleted_at=NULL,updated_at=? WHERE id=?").bind(now,projectId).run();await writeAudit(actor,"client.project_restored",projectId,null);return Response.json({ok:true,project:{id:project.id,name:project.name,status:"active"}})}
  const current=await env.DB.prepare("SELECT id,status,project_id AS projectId FROM admin_users WHERE id=? LIMIT 1").bind(id).first<{id:string;status:string;projectId:string}>();if(!current)return Response.json({error:"Client admin nahi mila"},{status:404});
  if(action==="toggle"){const status=current.status==="active"?"disabled":"active";await env.DB.batch([env.DB.prepare("UPDATE admin_users SET status=?,session_version=session_version+1,updated_at=? WHERE id=?").bind(status,now,id),env.DB.prepare("UPDATE project_memberships SET status=?,updated_at=? WHERE user_id=? AND project_id=?").bind(status,now,id,current.projectId)]);await writeAudit(actor,`client.${status}`,current.projectId,id);return Response.json({ok:true,status})}
  if(action==="domains"){if(await isGeoLab(current.projectId))return Response.json({error:"Geo Lab project par domain attach disabled hai"},{status:409});const publicHost=cleanHost(body.publicHost),adminHost=cleanHost(body.adminHost);if(!validHost(publicHost)||!validHost(adminHost))return Response.json({error:"Valid domain लिखें, https:// या path नहीं"},{status:400});try{await upsertPrimaryProjectDomain(current.projectId,"public",publicHost,now);await upsertPrimaryProjectDomain(current.projectId,"admin",adminHost,now)}catch{return Response.json({error:"Domain kisi aur project me use ho raha hai"},{status:409})}await writeAudit(actor,"project.domains_updated",current.projectId,id,{publicHost,adminHost});return Response.json({ok:true,publicHost,adminHost})}
  if(action==="rename"){const name=String(body.name||"").trim();if(name.length<2||name.length>80)return Response.json({error:"Valid name required"},{status:400});await env.DB.prepare("UPDATE admin_users SET name=?,updated_at=? WHERE id=?").bind(name,now,id).run();await writeAudit(actor,"client.renamed",current.projectId,id);return Response.json({ok:true,name})}
  if(action==="reset_password"){const password=String(body.password||"");if(!validClientPassword(password))return Response.json({error:"Password kam se kam 8 characters ka ho; letter + number zaroori hain, special optional hai"},{status:400});const hash=await hashAdminPassword(password);await env.DB.prepare("UPDATE admin_users SET password_hash=?,password_salt=?,must_change_password=1,session_version=session_version+1,updated_at=? WHERE id=?").bind(hash.passwordHash,hash.passwordSalt,now,id).run();await writeAudit(actor,"client.password_reset",current.projectId,id);return Response.json({ok:true})}
  return Response.json({error:"Invalid action"},{status:400});
}

export async function DELETE(request:Request){
  const actor=await requireSuperAdmin();if(!actor)return unauthorized();if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const id=new URL(request.url).searchParams.get("id");if(!id)return Response.json({error:"Missing id"},{status:400});
  const current=await env.DB.prepare("SELECT u.project_id AS projectId,p.name AS projectName,p.kind AS projectKind FROM admin_users u JOIN projects p ON p.id=u.project_id WHERE u.id=?").bind(id).first<{projectId:string;projectName:string;projectKind:string}>();if(!current)return Response.json({error:"Client admin nahi mila"},{status:404});
  const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM admin_users WHERE project_id=?").bind(current.projectId).first<{total:number}>();
  if(Number(count?.total||0)>1){await env.DB.batch([env.DB.prepare("DELETE FROM project_memberships WHERE user_id=? AND project_id=?").bind(id,current.projectId),env.DB.prepare("DELETE FROM admin_users WHERE id=?").bind(id)]);await writeAudit(actor,"client.admin_removed",current.projectId,id);return Response.json({ok:true,projectDeleted:false})}
  const deletedAt=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE projects SET status='deleted',deleted_at=?,public_status='draft',public_host=NULL,admin_host=NULL,updated_at=? WHERE id=?").bind(deletedAt,deletedAt,current.projectId),
    env.DB.prepare("UPDATE admin_users SET status='disabled',session_version=session_version+1,updated_at=? WHERE project_id=?").bind(deletedAt,current.projectId),
    env.DB.prepare("UPDATE project_memberships SET status='disabled',updated_at=? WHERE project_id=?").bind(deletedAt,current.projectId),
    env.DB.prepare("UPDATE project_domains SET status='disabled',public_primary=0,admin_primary=0,updated_at=? WHERE project_id=?").bind(deletedAt,current.projectId)
  ]);
  await writeAudit(actor,"client.project_archived",current.projectId,id,{recoverable:true});
  return Response.json({ok:true,projectDeleted:true,recoverable:true,deletedProject:{id:current.projectId,name:current.projectName,deletedAt}});
}
