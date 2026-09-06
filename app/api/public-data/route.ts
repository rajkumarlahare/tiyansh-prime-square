import { getDb } from "../../../db";
import { gallery,plots,settings } from "../../../db/schema";
import { desc } from "drizzle-orm";
export async function GET(){try{const db=getDb();const [plotRows,settingRows,galleryRows]=await Promise.all([db.select().from(plots),db.select().from(settings),db.select({id:gallery.id,caption:gallery.caption,filename:gallery.filename}).from(gallery).orderBy(desc(gallery.sortOrder))]);return Response.json({plots:plotRows,settings:Object.fromEntries(settingRows.map(x=>[x.key,x.value])),gallery:galleryRows},{headers:{"cache-control":"no-store"}})}catch(error){console.error("Public data load failed",error);return Response.json({plots:[],settings:{},gallery:[]},{headers:{"cache-control":"no-store"}})}}
