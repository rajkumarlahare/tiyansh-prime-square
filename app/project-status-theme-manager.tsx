"use client";

import { Palette, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type StatusKey = "available" | "booked" | "sold";
type ThemeColors = Record<StatusKey, string>;

type ThemeResponse = {
  projectId?: string;
  projectName?: string;
  colors?: ThemeColors;
  custom?: Record<StatusKey, boolean>;
  error?: string;
};

const STATUS_ORDER: StatusKey[] = ["available", "booked", "sold"];
const DEFAULTS: ThemeColors = {
  available: "#12C568",
  booked: "#F5B516",
  sold: "#F0314C",
};

const LABELS: Record<StatusKey, string> = {
  available: "Available",
  booked: "Booked",
  sold: "Sold",
};

function normalizeColor(value: string) {
  const raw = String(value || "").trim();
  const short = raw.match(/^#?([0-9a-f]{3})$/i);
  if (short) {
    const expanded = short[1].split("").map((char) => char + char).join("");
    return `#${expanded.toUpperCase()}`;
  }
  const full = raw.match(/^#?([0-9a-f]{6})$/i);
  if (full) return `#${full[1].toUpperCase()}`;
  const rgb = raw.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    const values = rgb.slice(1).map(Number);
    if (values.every((part) => part >= 0 && part <= 255)) {
      return `#${values.map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    }
  }
  return null;
}

export default function ProjectStatusThemeManager({
  projectId,
  notify,
}: {
  projectId: string;
  notify: (message: string) => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [draft, setDraft] = useState<ThemeColors>(DEFAULTS);
  const [saved, setSaved] = useState<ThemeColors>(DEFAULTS);
  const [custom, setCustom] = useState<Record<StatusKey, boolean>>({ available: false, booked: false, sold: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/project-status-theme?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const data = (await response.json()) as ThemeResponse;
      if (!response.ok) throw new Error(data.error || "Plot status colors load nahi hue");
      const next = data.colors || DEFAULTS;
      setProjectName(data.projectName || "Project");
      setDraft(next);
      setSaved(next);
      setCustom(data.custom || { available: false, booked: false, sold: false });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((error) => notify(error instanceof Error ? error.message : "Plot status colors load nahi hue"));
  }, [projectId]);

  const normalizedDraft = useMemo(() => {
    const next = {} as ThemeColors;
    for (const status of STATUS_ORDER) {
      const normalized = normalizeColor(draft[status]);
      if (!normalized) return null;
      next[status] = normalized;
    }
    return next;
  }, [draft]);

  const dirty = Boolean(normalizedDraft && STATUS_ORDER.some((status) => normalizedDraft[status] !== saved[status]));

  function setField(status: StatusKey, value: string) {
    setDraft((current) => ({ ...current, [status]: value }));
  }

  async function save() {
    if (busy) return;
    if (!normalizedDraft) return notify("Valid HEX ya rgb(...) color code use karein");
    if (!dirty) return notify("Koi naya status color change nahi hai");
    const changes = Object.fromEntries(STATUS_ORDER.filter((status) => normalizedDraft[status] !== saved[status]).map((status) => [status, normalizedDraft[status]]));
    setBusy(true);
    try {
      const response = await fetch("/api/admin/project-status-theme", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, changes }),
      });
      const data = (await response.json()) as ThemeResponse;
      if (!response.ok) throw new Error(data.error || "Plot status colors save nahi hue");
      const next = data.colors || normalizedDraft;
      setDraft(next);
      setSaved(next);
      setCustom(data.custom || { available: true, booked: true, sold: true });
      notify("2D plot status colors save ho gaye");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Plot status colors save nahi hue");
    } finally {
      setBusy(false);
    }
  }

  async function resetDefaults() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/project-status-theme", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, changes: { available: null, booked: null, sold: null } }),
      });
      const data = (await response.json()) as ThemeResponse;
      if (!response.ok) throw new Error(data.error || "Default colors restore nahi hue");
      const next = data.colors || DEFAULTS;
      setDraft(next);
      setSaved(next);
      setCustom(data.custom || { available: false, booked: false, sold: false });
      notify("Rekixo default 2D status colors restore ho gaye");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Default colors restore nahi hue");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <section className="card project-status-theme">2D plot status colors load ho rahe hain…</section>;
  const hasCustom = STATUS_ORDER.some((status) => custom[status]);

  return (
    <section className="card project-status-theme">
      <div className="project-status-theme-head">
        <div>
          <p>2D STATUS COLORS</p>
          <h2>Plot Status Colors</h2>
          <span>{projectName} ke liye project-scoped colors. 3D rendering unchanged rahegi.</span>
        </div>
        <em className={hasCustom ? "custom" : "default"}><Palette />{hasCustom ? "Custom project theme" : "Rekixo defaults"}</em>
      </div>

      <div className="project-status-theme-grid">
        {STATUS_ORDER.map((status) => {
          const normalized = normalizeColor(draft[status]);
          const pickerValue = normalized || DEFAULTS[status];
          return (
            <article key={status} data-status={status}>
              <div className="project-status-theme-label">
                <i style={{ backgroundColor: pickerValue }} />
                <div><b>{LABELS[status]}</b><small>{custom[status] ? "Project override" : "Default color"}</small></div>
              </div>
              <label className="project-status-color-picker">
                <span>Choose</span>
                <input type="color" value={pickerValue} disabled={busy} onChange={(event) => setField(status, event.target.value.toUpperCase())} aria-label={`Choose ${LABELS[status]} color`} />
              </label>
              <label className="project-status-color-code">
                <span>Color code</span>
                <input value={draft[status]} maxLength={32} disabled={busy} spellCheck={false} autoCapitalize="characters" onChange={(event) => setField(status, event.target.value)} placeholder="#12C568 or rgb(18,197,104)" aria-invalid={!normalized} />
              </label>
            </article>
          );
        })}
      </div>

      <div className="project-status-theme-actions">
        <button type="button" className="primary" disabled={busy || !dirty || !normalizedDraft} onClick={save}><Save />{busy ? "Saving…" : "Save Status Colors"}</button>
        <button type="button" disabled={busy} onClick={resetDefaults}><RotateCcw />Reset Rekixo defaults</button>
        <small>Selected plot strong rahega; STATUS toggle ON par baaki polygons medium tint me dikhenge. Saved polygon geometry/status data touch nahi hota.</small>
      </div>
    </section>
  );
}
