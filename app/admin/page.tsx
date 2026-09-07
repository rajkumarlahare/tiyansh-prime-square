import AdminDashboard from "../admin-dashboard";
import SuperAdminDashboard from "../super-admin-dashboard";
import { panelMode,requireAdminSession } from "../admin-auth";
export const dynamic="force-dynamic";
export default async function AdminPage(){const session=await requireAdminSession();if(panelMode()==="super")return <SuperAdminDashboard user={{name:session.name,email:session.email}}/>;return <AdminDashboard user={{name:session.name,email:session.email,role:"client_admin"}} signOut="/api/admin/logout" projectId={session.projectId}/>}
