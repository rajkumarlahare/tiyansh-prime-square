import { redirect } from "next/navigation";
import { panelMode } from "./admin-auth";
export const dynamic="force-dynamic";
export default function Home(){if(panelMode()==="super")redirect("/admin");return <main style={{position:"fixed",inset:0,background:"#050914"}}><iframe title="Tiyansh — The Prime Square" src="/project/index.html?v=39" loading="eager" style={{width:"100%",height:"100%",border:0,display:"block"}}/></main>}
