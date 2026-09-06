import {env} from "cloudflare:workers";
import {getAdminSession} from "../../../admin-auth";
import {publicProjectId} from "../../../project-context";

export async function GET(request:Request,{params}:{params:Promise<{kind:string}>}){
  const {kind}=await params;if(!["masterplan","sourcePdf"].includes(kind))return new Response("Not found",{status:404});
  const session=await getAdminSession(),requested=new URL(request.url).searchParams.get("projectId"),projectId=session?.role==="super_admin"&&requested?requested:session?.projectId||await publicProjectId(request);if(!projectId)return new Response("Not found",{status:404});
  const object=await env.BUCKET.get(`projects/${projectId}/mapper/${kind}`);if(!object)return new Response("Not found",{status:404});
  const headers=new Headers({"content-type":object.httpMetadata?.contentType||"application/octet-stream","cache-control":session?"no-store":"public,max-age=3600","x-content-type-options":"nosniff"});if(object.httpEtag)headers.set("etag",object.httpEtag);return new Response(object.body,{headers});
}
