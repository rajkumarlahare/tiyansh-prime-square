import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { panelMode } from "./admin-auth";
import { projectHostRole } from "./project-context";

export const dynamic = "force-dynamic";

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#050914",
        color: "#f7f9ff",
      }}
    >
      <section
        style={{
          maxWidth: 560,
          padding: 32,
          border: "1px solid #26344b",
          borderRadius: 18,
          background: "#0b1424",
          textAlign: "center",
        }}
      >
        <h1>{title}</h1>
        <p>{text}</p>
      </section>
    </main>
  );
}

export default async function Home() {
  if (panelMode() === "super") redirect("/admin");
  const host = (await headers()).get("host") || "";
  const target = await projectHostRole(host);

  if (target?.role === "admin" || target?.role === "admin_shared")
    redirect("/admin");
  if (target?.role === "unpublished")
    return (
      <Message
        title="Website is being prepared"
        text="Project अभी draft/review में है। Publish complete होने के बाद यही domain live website दिखाएगा।"
      />
    );
  if (!target)
    return (
      <Message
        title="Project domain not configured"
        text="इस domain को Rekixo Super Admin में सही client project से जोड़ें।"
      />
    );

  return (
    <main style={{ position: "fixed", inset: 0, background: "#050914" }}>
      <iframe
        title="Client project website"
        src="/project/index.html?v=51"
        loading="eager"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      />
    </main>
  );
}
