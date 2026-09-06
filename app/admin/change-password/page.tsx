import { redirect } from "next/navigation";
import { getAdminSession } from "../../admin-auth";
import ChangePasswordForm from "./password-form";
export const dynamic="force-dynamic";
export default async function ChangePasswordPage(){const session=await getAdminSession();if(!session)redirect("/admin/login");if(session.role!=="client_admin"||!session.mustChangePassword)redirect("/admin");return <ChangePasswordForm email={session.email}/>}
