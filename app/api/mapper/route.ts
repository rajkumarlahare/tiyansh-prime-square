import {env} from "cloudflare:workers";
import {sameOrigin,validAdminSession} from "../../admin-auth";
import {writeAudit} from "../../audit";

const denied=()=>Response.json({error:"Admin login required"},{status:401});
const allowed={masterplan:["image/jpeg","image/png","image/webp"],sourcePdf:["application/pdf"]} as const;

export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin"},{status:403});
  const session=await validAdminSession();if(!session)return denied();
  const form=await request.formData(),kind=String(form.get("kind")||"") as keyof typeof allowed,file=form.get("file");
  if(!allowed[kind]||!(file instanceof File)||!allowed[kind].includes(file.type as never))return Response.json({error:"Masterplan image या PDF सही format में चुनें"},{status:400});
  const limit=kind==="masterplan"?15*1024*1024:25*1024*1024;if(file.size>limit)return Response.json({error:`File ${limit/1024/1024} MB से छोटी होनी चाहिए`},{status:400});
  const key=`projects/${session.projectId}/mapper/${kind}`;
  await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:file.type}});
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO settings (project_id,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(project_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(session.projectId,`${kind}Name`,file.name.slice(0,240),now).run();
  await writeAudit(session,`mapper.${kind}_uploaded`,session.projectId,null,{filename:file.name,size:file.size});
  return Response.json({ok:true,name:file.name,url:`/api/project-asset/${kind}?v=${Date.now()}`});
}
