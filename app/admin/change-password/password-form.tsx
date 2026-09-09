"use client";
import { useState } from "react";
import { Eye,EyeOff,KeyRound } from "lucide-react";
import {
  CLIENT_PASSWORD_HINT,
  CLIENT_PASSWORD_MAX_LENGTH,
  CLIENT_PASSWORD_MIN_LENGTH,
} from "../../client-password-policy";

export default function ChangePasswordForm({email,successPath="/admin"}:{email:string;successPath?:string}){
  const [password,setPassword]=useState(""),[confirmPassword,setConfirmPassword]=useState(""),[showPassword,setShowPassword]=useState(false),[showConfirm,setShowConfirm]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");try{const response=await fetch("/api/admin/change-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password,confirmPassword})});const data=await response.json();if(!response.ok)throw new Error(data.error);location.replace(successPath)}catch(value){setError(value instanceof Error?value.message:"Password change nahi hua")}finally{setBusy(false)}}
  return <main className="login-page"><section className="login-card"><div className="login-icon"><KeyRound/></div><h1>Create New Password</h1><p>{email}<br/>Temporary password ko change karna zaroori hai.</p><form onSubmit={submit}><label><span>NEW PASSWORD</span><div className="login-input"><input type={showPassword?"text":"password"} required minLength={CLIENT_PASSWORD_MIN_LENGTH} maxLength={CLIENT_PASSWORD_MAX_LENGTH} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="8+ characters"/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Hide new password":"Show new password"}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label><label><span>CONFIRM PASSWORD</span><div className="login-input"><input type={showConfirm?"text":"password"} required minLength={CLIENT_PASSWORD_MIN_LENGTH} maxLength={CLIENT_PASSWORD_MAX_LENGTH} autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} placeholder="Password dobara likhein"/><button type="button" onClick={()=>setShowConfirm(value=>!value)} aria-label={showConfirm?"Hide confirmed password":"Show confirmed password"}>{showConfirm?<EyeOff/>:<Eye/>}</button></div></label><small>{CLIENT_PASSWORD_HINT}</small>{error&&<div className="login-error">{error}</div>}<button className="login-submit" disabled={busy}>{busy?"Saving…":"Save New Password"}</button></form></section></main>
}
