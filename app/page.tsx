import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { panelMode } from "./admin-auth";
import { projectHostRole } from "./project-context";
export const dynamic="force-dynamic";
export default async function Home(){if(panelMode()==="super")redirect("/admin");const host=(await headers()).get("host")||"";const target=await projectHostRole(host);if(target?.role==="admin")redirect("/admin");if(!target)return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#050914",color:"#f7f9ff"}}><section style={{maxWidth:560,padding:32,border:"1px solid #26344b",borderRadius:18,background:"#0b1424",textAlign:"center"}}><h1>Project domain not configured</h1><p>इस domain को Rekixo Super Admin में सही client project से जोड़ें।</p></section></main>;return <main style={{position:"fixed",inset:0,background:"#050914"}}><iframe title="Client project website" src="/project/index.html?v=40" loading="eager" style={{width:"100%",height:"100%",border:0,display:"block"}}/></main>}
