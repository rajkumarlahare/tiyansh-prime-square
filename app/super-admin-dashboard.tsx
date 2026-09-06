"use client";
import { useRef,useState } from "react";
import { LogOut,ShieldCheck } from "lucide-react";
import ClientAdminManager from "./client-admin-manager";

export default function SuperAdminDashboard({user}:{user:{name:string;email:string}}){
  const [toast,setToast]=useState("");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  function notify(message:string){setToast(message);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(""),2800)}
  return <div className="super-shell">
    <header className="super-header"><div className="super-brand"><span><ShieldCheck/></span><div><b>REKIXO</b><small>SUPER ADMIN</small></div></div><div className="super-account"><div><b>{user.name}</b><small>{user.email}</small></div><a href="/api/admin/logout"><LogOut/>Sign out</a></div></header>
    <main className="super-content"><div className="super-title"><p>CLIENT OPERATIONS</p><h1>Projects & Access</h1><span>Create projects, assign client access, manage domains and suspend accounts.</span></div><ClientAdminManager notify={notify}/></main>
    {toast&&<div className="toast-admin">{toast}</div>}
  </div>
}
