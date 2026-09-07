"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Eye, Globe2, ShieldAlert } from "lucide-react";

type State = {
  projectId?: string;
  name?: string;
  publicStatus?: string;
  publishVersion?: number;
  total?: number;
  mapped?: number;
  invalid?: number;
  ready?: boolean;
  reasons?: string[];
  publicUrl?: string;
  platformUrl?: string;
  fallbackUrl?: string;
  legacy?: boolean;
};

export default function ProjectPublishPanel({
  projectId,
  notify,
}: {
  projectId: string;
  notify: (message: string) => void;
}) {
  const [state, setState] = useState<State>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(
      `/api/admin/publish?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Publish status load nahi hua");
    setState(data);
  }

  useEffect(() => {
    load().catch((error) =>
      notify(error instanceof Error ? error.message : "Publish status load nahi hua"),
    );
  }, [projectId, notify]);

  async function action(next: "publish" | "unpublish") {
    if (
      !confirm(
        next === "publish"
          ? "Project ko public website par publish karein?"
          : "Public website ko draft mode me le jayein?",
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, action: next }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.reasons?.length
            ? `${data.error}: ${data.reasons.join(" · ")}`
            : data.error || "Publish update nahi hua",
        );
      setState(data);
      notify(next === "publish" ? "Project LIVE publish ho gaya" : "Project draft mode me hai");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Publish update nahi hua");
    } finally {
      setBusy(false);
    }
  }

  const published = state.publicStatus === "published";

  return (
    <section className="card rekixo-publish-panel">
      <div className="section-title">
        {published ? <Globe2 /> : state.ready ? <CheckCircle2 /> : <ShieldAlert />}
        <div>
          <h2>Review & Publish</h2>
          <p>
            Public site tabhi open hogi jab required masterplan + plot boundaries
            complete हों.
          </p>
        </div>
      </div>

      <div className="rekixo-publish-stats">
        <span>
          Mapped <b>{state.mapped ?? "—"}/{state.total ?? "—"}</b>
        </span>
        <span>
          Invalid <b>{state.invalid ?? "—"}</b>
        </span>
        <span>
          Status <b>{state.publicStatus || "…"}</b>
        </span>
        <span>
          Version <b>{state.publishVersion ?? 0}</b>
        </span>
      </div>

      {!state.ready && state.reasons?.length ? (
        <ul className="rekixo-publish-reasons">
          {state.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="rekixo-publish-actions">
        <a
          href={`/preview/${encodeURIComponent(projectId)}`}
          target="_blank"
          rel="noreferrer"
        >
          <Eye /> Authenticated preview
        </a>
        {published && state.publicUrl ? (
          <a href={state.publicUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Open live site
          </a>
        ) : null}
        {!published ? (
          <button
            className="primary"
            disabled={busy || !state.ready}
            onClick={() => action("publish")}
          >
            <CheckCircle2 /> {busy ? "Publishing…" : "Publish Website"}
          </button>
        ) : !state.legacy ? (
          <button disabled={busy} onClick={() => action("unpublish")}>
            {busy ? "Updating…" : "Unpublish"}
          </button>
        ) : null}
      </div>

      {published && state.fallbackUrl ? (
        <small>Fallback live URL: {state.fallbackUrl}</small>
      ) : null}
    </section>
  );
}
