"use client";

import { useMemo, useState } from "react";
import { Copy, ShieldCheck } from "lucide-react";
import styles from "./geo-lab-clone.module.css";

type Project = { id: string; name: string; kind: string; status: string; adminCount: number };

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
  const sourceProjects = projects.filter(
    (project) => project.id !== projectId && project.kind !== "geo_lab",
  );

  async function clone() {
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
            Source project read-only rahega. Selected empty draft project successful clone par explicit Geo Lab banega.
          </span>
        </div>
      </div>

      <div className={destination ? styles.safe : styles.blocked}>
        <b>Destination:</b> {destination?.name || "Unknown project"}
        <span>
          {destination?.kind === "geo_lab"
            ? "Explicit Geo Lab project selected."
            : "Server empty/draft/domainless checks pass hone par ye project Geo Lab mark hoga."}
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
        disabled={busy || !destination || !sourceProjectId || confirmation !== "CLONE TO GEO LAB"}
      >
        <Copy /> {busy ? "Creating isolated clone…" : "Clone Into This Geo Lab"}
      </button>
    </section>
  );
}
