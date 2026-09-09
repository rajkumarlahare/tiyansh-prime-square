import { env } from "cloudflare:workers";
import { getAdminSession,hashAdminPassword,sameOrigin,sessionCookie } from "../../../admin-auth";
import { validClientPassword } from "../../../client-password-policy";

export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const session=await getAdminSession();
  if(!session||session.role!=="client_admin")return Response.json({error:"Admin login required"},{status:401});
  const body=await request.json().catch(()=>({})) as {password?:string;confirmPassword?:string};
  const password=String(body.password||"");
  if(password!==String(body.confirmPassword||""))return Response.json({error:"Passwords match nahi karte"},{status:400});
  if(!validClientPassword(password))return Response.json({error:"Password kam se kam 8 characters ka ho; letter + number zaroori hain, special character optional hai"},{status:400});
  const hash=await hashAdminPassword(password),now=new Date().toISOString(),nextVersion=session.sessionVersion+1;
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_users SET password_hash=?, password_salt=?, must_change_password=0, session_version=?, password_changed_at=?, updated_at=? WHERE id=? AND project_id=?").bind(hash.passwordHash,hash.passwordSalt,nextVersion,now,now,session.id,session.projectId),
    env.DB.prepare("INSERT INTO audit_logs (id,actor_id,actor_email,action,project_id,target_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),session.id,session.email,"client.password_changed",session.projectId,session.id,"{}",now)
  ]);
  return Response.json({ok:true},{headers:{"set-cookie":await sessionCookie({...session,sessionVersion:nextVersion,mustChangePassword:false,exp:Date.now()+8*60*60*1000}),"cache-control":"no-store"}});
}
