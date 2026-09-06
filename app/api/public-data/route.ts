import { getDb } from "../../../db";
import { gallery,plots,settings } from "../../../db/schema";
import { desc,eq } from "drizzle-orm";
import { publicProjectId } from "../../project-context";
export async function GET(request:Request){try{const db=getDb(),projectId=await publicProjectId(request);const [plotRows,settingRows,galleryRows]=await Promise.all([db.select().from(plots).where(eq(plots.projectId,projectId)),db.select().from(settings).where(eq(settings.projectId,projectId)),db.select({id:gallery.id,caption:gallery.caption,filename:gallery.filename}).from(gallery).where(eq(gallery.projectId,projectId)).orderBy(desc(gallery.sortOrder))]);return Response.json({plots:plotRows,settings:Object.fromEntries(settingRows.map(x=>[x.key,x.value])),gallery:galleryRows},{headers:{"cache-control":"no-store"}})}catch(error){console.error("Public data load failed",error);return Response.json({plots:[],settings:{},gallery:[]},{headers:{"cache-control":"no-store"}})}}
