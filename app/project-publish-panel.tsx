"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  Globe2,
  ShieldAlert,
} from "lucide-react";

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
  adminUrl?: string;
  platformUrl?: string;
  platformAdminUrl?: string;
  fallbackUrl?: string;
  fallbackAdminUrl?: string;
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
  const [busyAction, setBusyAction] = useState<"publish" | "unpublish" | null>(null);

  async function load() {
    const response = await fetch(
      `/api/admin/publish?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Publish status load nahi hua");
    setState(data);
  }

  useEffect(() => {
    load().catch((error) =>
      notify(
        error instanceof Error ? error.message : "Publish status load nahi hua",
      ),
    );
  }, [projectId, notify]);

  useEffect(() => {
    const handleProjectUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== projectId) return;
      load().catch((error) =>
        notify(
          error instanceof Error
            ? error.message
            : "Publish status refresh nahi hua",
        ),
      );
    };
    const events = [
      "rekixo:mapper-settings-updated",
      "rekixo:share-profile-updated",
      "rekixo:project-profile-updated",
    ] as const;
    events.forEach((name) =>
      window.addEventListener(name, handleProjectUpdate),
    );
    return () =>
      events.forEach((name) =>
        window.removeEventListener(name, handleProjectUpdate),
      );
  }, [projectId, notify]);

  async function action(next: "publish" | "unpublish") {
    const republishing =
      next === "publish" && state.publicStatus === "published";
    if (
      !confirm(
        next === "publish"
          ? republishing
            ? "Latest project changes ko public website par publish karein?"
            : "Project ko public website par publish karein?"
          : "Public website ko draft mode me le jayein?",
      )
    )
      return;
    setBusyAction(next);
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
      notify(
        next === "publish"
          ? republishing
            ? "Latest changes LIVE publish ho gaye"
            : "Project LIVE publish ho gaya"
          : "Project draft mode me hai",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Publish update nahi hua");
    } finally {
      setBusyAction(null);
    }
  }

  const published = state.publicStatus === "published";

  return (
    <section className="card rekixo-publish-panel">
      <div className="section-title">
        {published ? (
          <Globe2 />
        ) : state.ready ? (
          <CheckCircle2 />
        ) : (
          <ShieldAlert />
        )}
        <div>
          <h2>Review & Publish</h2>
          <p>
            Public site tabhi open hogi jab masterplan, plot boundaries aur share
            preview complete hon.
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
        {state.adminUrl ? (
          <a href={state.adminUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Client admin
          </a>
        ) : null}
        {!published || !state.legacy ? (
          <button
            className="primary"
            disabled={Boolean(busyAction) || !state.ready}
            onClick={() => action("publish")}
          >
            <CheckCircle2 />{" "}
            {busyAction === "publish"
              ? published
                ? "Publishing update…"
                : "Publishing…"
              : published
                ? "Publish Update"
                : "Publish Website"}
          </button>
        ) : null}
        {published && !state.legacy ? (
          <button disabled={Boolean(busyAction)} onClick={() => action("unpublish")}>
            {busyAction === "unpublish" ? "Updating…" : "Unpublish"}
          </button>
        ) : null}
      </div>

      {published ? (
        <div>
          {state.publicUrl ? (
            <small>Canonical site: {state.publicUrl}</small>
          ) : null}
          {state.publicUrl && state.adminUrl ? <br /> : null}
          {state.adminUrl ? (
            <small>Canonical admin: {state.adminUrl}</small>
          ) : null}
          {state.fallbackUrl ? (
            <>
              <br />
              <small>Free fallback site: {state.fallbackUrl}</small>
            </>
          ) : null}
          {state.fallbackAdminUrl ? (
            <>
              <br />
              <small>Free fallback admin: {state.fallbackAdminUrl}</small>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
