// Plot mapping belongs exclusively to Rekixo Super Admin.
// Kept as an explicit deny route so older client deployments cannot retain access.
const denied=()=>Response.json({error:"Plot Mapper is available only in Rekixo Super Admin"},{status:403,headers:{"cache-control":"no-store"}});
export async function GET(){return denied()}
export async function POST(){return denied()}
export async function PATCH(){return denied()}
export async function DELETE(){return denied()}
