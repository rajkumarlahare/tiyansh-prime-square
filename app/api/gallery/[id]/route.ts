import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { gallery } from "../../../../db/schema";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){try{const {id}=await context.params,[item]=await getDb().select().from(gallery).where(eq(gallery.id,id)).limit(1);if(!item)return new Response("Not found",{status:404});const object=await env.BUCKET.get(item.objectKey);if(!object)return new Response("Not found",{status:404});const headers=new Headers({"content-type":item.contentType,"cache-control":"public, max-age=31536000, immutable"});if(object.httpEtag)headers.set("etag",object.httpEtag);if(object.size)headers.set("content-length",String(object.size));return new Response(object.body,{headers})}catch(error){console.error("Gallery image load failed",error);return new Response("Image load nahi hui",{status:500})}}
