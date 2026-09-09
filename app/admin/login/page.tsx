import { redirect } from "next/navigation";
import { panelMode,validAdminSession } from "../../admin-auth";
import LoginForm from "./login-form";

export const dynamic="force-dynamic";

function loginError(code:string|undefined){
  if(code==="invalid")return "Email ya password galat hai.";
  if(code==="rate")return "Too many attempts. 15 minutes baad try karein.";
  if(code==="origin")return "Login request reject hua. Page reload karke dobara try karein.";
  return "";
}

export default async function LoginPage({searchParams}:{searchParams:Promise<{loginError?:string}>}){
  if(await validAdminSession())redirect("/admin");
  const query=await searchParams;
  return <LoginForm mode={panelMode()} initialError={loginError(query.loginError)}/>;
}
