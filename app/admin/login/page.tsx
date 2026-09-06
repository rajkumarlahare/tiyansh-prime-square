import { redirect } from "next/navigation";
import { panelMode,validAdminSession } from "../../admin-auth";
import LoginForm from "./login-form";
export const dynamic="force-dynamic";
export default async function LoginPage(){if(await validAdminSession())redirect("/admin");return <LoginForm mode={panelMode()}/>}
