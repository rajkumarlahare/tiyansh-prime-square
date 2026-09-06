import AdminDashboard from "../admin-dashboard";
import { requireAdminSession } from "../admin-auth";
export const dynamic="force-dynamic";
export default async function AdminPage(){await requireAdminSession();return <AdminDashboard user={{name:"Tiyansh Admin",email:"admin@tiyansh.local"}} signOut="/api/admin/logout"/>}
