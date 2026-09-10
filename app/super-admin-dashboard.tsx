"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Globe2,
  LogOut,
  MapPinned,
  ContactRound,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";
import ClientAdminManager from "./client-admin-manager";
import GeoLabClone from "./geo-lab-clone";
import GeoMapper from "./geo-mapper";
import PlotMapper from "./plot-mapper";
import ProjectDomainManager from "./project-domain-manager";
import ProjectPublishPanel from "./project-publish-panel";
import ProjectProfileManager from "./project-profile-manager";
import ProjectShareManager from "./project-share-manager";

type Project = {
  id: string;
  name: string;
  status: string;
  adminCount: number;
};

type WorkspaceTab = "clients" | "profile" | "mapper" | "geo" | "share";

export default function SuperAdminDashboard({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<WorkspaceTab>("clients");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2800);
  }, []);

  useEffect(() => {
    if (tab === "clients") return;
    let live = true;
    fetch("/api/admin/users", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!live) return;
        const list = (data.projects || []).filter(
          (project: Project) => project.status !== "deleted",
        );
        setProjects(list);
        setProjectId((current) =>
          current && list.some((project: Project) => project.id === current)
            ? current
            : list[0]?.id || "",
        );
      })
      .catch(() => notify("Projects load नहीं हुए"));
    return () => {
      live = false;
    };
  }, [tab, notify]);

  const projectPicker = (
    <div className="super-project-picker">
      <label htmlFor="workspace-project">Client project</label>
      <select
        id="workspace-project"
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
      >
        <option value="">Project चुनें</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} · {project.adminCount} admin
          </option>
        ))}
      </select>
      {projectId ? (
        <a
          className="mapper-preview-link"
          href={`/preview/${encodeURIComponent(projectId)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink /> Authenticated preview
        </a>
      ) : null}
    </div>
  );

  const title =
    tab === "clients"
      ? "Projects & Access"
      : tab === "profile"
        ? "Project Profile"
        : tab === "mapper"
          ? "Plot Mapper Engine"
          : tab === "geo"
            ? "Geo Mapper"
            : "Share Preview Builder";
  const subtitle =
    tab === "clients"
      ? "Create projects, assign client access and manage domains."
      : tab === "profile"
        ? "One canonical contact profile — Super Admin, Client Admin aur public site sab isi data ko use karte hain."
        : tab === "mapper"
          ? "Company masterplan से client website के clickable plots तैयार करें।"
          : tab === "geo"
            ? "Project boundaries, GPS control points aur GIS exchange data ko isolated Geo workspace me manage karein."
            : "Har project ka branded WhatsApp / social link preview ek jagah se manage karein.";

  return (
    <div className="super-shell">
      <header className="super-header">
        <div className="super-brand">
          <span>
            <ShieldCheck />
          </span>
          <div>
            <b>REKIXO</b>
            <small>SUPER ADMIN</small>
          </div>
        </div>
        <div className="super-account">
          <div>
            <b>{user.name}</b>
            <small>{user.email}</small>
          </div>
          <a href="/api/admin/logout">
            <LogOut /> Sign out
          </a>
        </div>
      </header>

      <main className="super-content">
        <div className="super-title">
          <p>REKIXO OPERATIONS</p>
          <h1>{title}</h1>
          <span>{subtitle}</span>
        </div>

        <nav className="super-tabs">
          <button
            className={tab === "clients" ? "active" : ""}
            onClick={() => setTab("clients")}
          >
            <Users /> Clients
          </button>
          <button
            className={tab === "profile" ? "active" : ""}
            onClick={() => setTab("profile")}
          >
            <ContactRound /> Project Profile
          </button>
          <button
            className={tab === "mapper" ? "active" : ""}
            onClick={() => setTab("mapper")}
          >
            <MapPinned /> Plot Mapper
          </button>
          <button
            className={tab === "geo" ? "active" : ""}
            onClick={() => setTab("geo")}
          >
            <Globe2 /> Geo Mapper
          </button>
          <button
            className={tab === "share" ? "active" : ""}
            onClick={() => setTab("share")}
          >
            <Share2 /> Share Builder
          </button>
        </nav>

        {tab === "clients" ? (
          <>
            <ClientAdminManager notify={notify} />
            <ProjectDomainManager notify={notify} />
          </>
        ) : (
          <>
            {projectPicker}
            {!projectId ? (
              <div className="card empty">
                पहले client project बनाएँ या project चुनें।
              </div>
            ) : tab === "profile" ? (
              <>
                <ProjectProfileManager
                  key={projectId}
                  projectId={projectId}
                  notify={notify}
                />
                <ProjectPublishPanel projectId={projectId} notify={notify} />
              </>
            ) : tab === "mapper" ? (
              <>
                <PlotMapper key={projectId} projectId={projectId} notify={notify} />
                <ProjectPublishPanel projectId={projectId} notify={notify} />
              </>
            ) : tab === "geo" ? (
              <>
                <GeoLabClone
                  key={`geo-lab:${projectId}`}
                  projectId={projectId}
                  projects={projects}
                  notify={notify}
                />
                <GeoMapper key={projectId} projectId={projectId} notify={notify} />
              </>
            ) : (
              <>
                <ProjectShareManager
                  key={projectId}
                  projectId={projectId}
                  notify={notify}
                />
                <ProjectPublishPanel projectId={projectId} notify={notify} />
              </>
            )}
          </>
        )}
      </main>

      {toast ? <div className="toast-admin">{toast}</div> : null}
    </div>
  );
}
