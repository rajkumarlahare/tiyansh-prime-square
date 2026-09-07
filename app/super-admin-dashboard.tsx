"use client";
import {useEffect,useRef,useState} from "react";
import {ExternalLink,LogOut,MapPinned,ShieldCheck,Users} from "lucide-react";
import ClientAdminManager from "./client-admin-manager";
import PlotMapper from "./plot-mapper";
type Project={id:string;name:string;status:string;adminCount:number};
export default function SuperAdminDashboard({user}:{user:{name:string;email:string}}){
  const [toast,setToast]=useState(""),[tab,setTab]=useState<"clients"|"mapper">("clients"),[projects,setProjects]=useState<Project[]>([]),[projectId,setProjectId]=useState("");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function notify(message:string){setToast(message);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(""),2800)}
  useEffect(()=>{if(tab!=="mapper"||projects.length)return;fetch("/api/admin/users",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{const list=(data.projects||[]).filter((p:Project)=>p.status!=="deleted");setProjects(list);setProjectId(current=>current||list[0]?.id||"")}).catch(()=>notify("Projects load नहीं हुए"))},[tab,projects.length]);
  return <div className="super-shell">
    <header className="super-header"><div className="super-brand"><span><ShieldCheck/></span><div><b>REKIXO</b><small>SUPER ADMIN</small></div></div><div className="super-account"><div><b>{user.name}</b><small>{user.email}</small></div><a href="/api/admin/logout"><LogOut/>Sign out</a></div></header>
    <main className="super-content"><div className="super-title"><p>REKIXO OPERATIONS</p><h1>{tab==="clients"?"Projects & Access":"Plot Mapper Engine"}</h1><span>{tab==="clients"?"Create projects, assign client access and manage domains.":"Company masterplan से client website के clickable plots तैयार करें।"}</span></div><nav className="super-tabs"><button className={tab==="clients"?"active":""} onClick={()=>setTab("clients")}><Users/> Clients</button><button className={tab==="mapper"?"active":""} onClick={()=>setTab("mapper")}><MapPinned/> Plot Mapper</button></nav>{tab==="clients"?<ClientAdminManager notify={notify}/>:<><div className="super-project-picker"><label htmlFor="mapper-project">Client project</label><select id="mapper-project" value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Project चुनें</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name} · {project.adminCount} admin</option>)}</select>{projectId&&<a className="mapper-preview-link" href={`/preview/${encodeURIComponent(projectId)}`} target="_blank" rel="noopener noreferrer"><ExternalLink/>Live preview</a>}</div>{projectId?<PlotMapper key={projectId} projectId={projectId} notify={notify}/>:<div className="card empty">पहले client project बनाएँ या project चुनें।</div>}</>}</main>
    {toast&&<div className="toast-admin">{toast}</div>}
  </div>
}
