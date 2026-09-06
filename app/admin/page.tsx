import AdminDashboard from "../admin-dashboard";
import { requireAdminSession } from "../admin-auth";
export const dynamic="force-dynamic";
export default async function AdminPage(){const session=await requireAdminSession();return <AdminDashboard user={{name:session.name,email:session.email,role:session.role}} signOut="/api/admin/logout"/>}
