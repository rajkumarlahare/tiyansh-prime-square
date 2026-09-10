"use client";

import { useMemo, useState } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import styles from "./geo-lab-clone.module.css";

type Project = { id: string; name: string; status: string; adminCount: number };

export default function GeoLabClone({
  projectId,
  projects,
  notify,
}: {
  projectId: string;
  projects: Project[];
  notify: (message: string) => void;
}) {
  const destination = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projectId, projects],
  );
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const isNamedLab = Boolean(destination && /\bGEO[\s_-]*LAB\b/i.test(destination.name));
  const sourceProjects = projects.filter((project) => project.id !== projectId);

  async function clone() {
    if (!isNamedLab) {
      notify("Destination project name me GEO LAB hona required hai");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/super-geo-lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, sourceProjectId, confirmation }),
      });
      const data = (await response.json()) as {
        error?: string;
        plots?: number;
        assets?: number;
      };
      if (!response.ok) throw new Error(data.error || "Geo Lab clone fail hua");
      notify(
        `Geo Lab ready: ${Number(data.plots || 0)} plots + ${Number(data.assets || 0)} mapper assets copied`,
      );
      setConfirmation("");
      notify("Geo Lab clone complete. Neeche Geo Mapper me Refresh dabakar cloned data verify karein.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Geo Lab clone fail hua");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card ${styles.card}`}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ISOLATED GEO LAB</p>
          <h2>
            <ShieldCheck /> Clone stable Plot Mapper source safely
          </h2>
          <span>
            Source project read-only rahega. Clone sirf selected empty GEO LAB project me write hota hai.
          </span>
        </div>
      </div>

      <div className={isNamedLab ? styles.safe : styles.blocked}>
        <b>Destination:</b> {destination?.name || "Unknown project"}
        <span>
          {isNamedLab
            ? "GEO LAB naming guard passed."
            : "Clone disabled: destination name me GEO LAB likhna zaroori hai."}
        </span>
      </div>

      <div className={styles.grid}>
        <label>
          <span>Read-only source project</span>
          <select
            value={sourceProjectId}
            onChange={(event) => setSourceProjectId(event.target.value)}
            disabled={busy}
          >
            <option value="">Source project choose karein</option>
            {sourceProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.adminCount} admin
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Safety confirmation</span>
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="CLONE TO GEO LAB"
            disabled={busy}
          />
        </label>
      </div>

      <div className={styles.rules}>
        Source se plot geometry/dimensions + mapper masterplan/CAD/PDF/plot sheet copies li jayengi.
        Customer status, notes, featured, domains, client accounts, gallery, share/public state copy nahi
        honge. Destination public publish aur new domain attachment server-side blocked rahega.
      </div>

      <button
        className={styles.cloneButton}
        onClick={clone}
        disabled={busy || !isNamedLab || !sourceProjectId || confirmation !== "CLONE TO GEO LAB"}
      >
        <Copy /> {busy ? "Creating isolated clone…" : "Clone Into This Geo Lab"}
      </button>
    </section>
  );
}
