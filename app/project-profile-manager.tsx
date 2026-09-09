"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Phone,
  Save,
} from "lucide-react";
import {
  PROJECT_CONTACT_KEYS,
  PROJECT_CONTACT_LABELS,
  PROJECT_REQUIRED_CONTACT_KEYS,
  emptyProjectContactProfile,
  projectMapFallbackUrl,
  type ProjectContactKey,
  type ProjectContactProfile,
} from "./project-profile-policy";

type ApiState = {
  projectId?: string;
  projectName?: string;
  profile?: ProjectContactProfile;
  missing?: ProjectContactKey[];
  ready?: boolean;
};

function valuesEqual(a: string, b: string) {
  return String(a || "").trim() === String(b || "").trim();
}

export default function ProjectProfileManager({
  projectId,
  notify,
}: {
  projectId: string;
  notify: (message: string) => void;
}) {
  const [projectName, setProjectName] = useState("");
  const [profile, setProfile] = useState<ProjectContactProfile>(
    emptyProjectContactProfile(),
  );
  const [saved, setSaved] = useState<ProjectContactProfile>(
    emptyProjectContactProfile(),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/project-profile?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as ApiState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Project profile load nahi hua");
      const next = data.profile || emptyProjectContactProfile();
      setProjectName(data.projectName || "Project");
      setProfile(next);
      setSaved(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((error) =>
      notify(error instanceof Error ? error.message : "Project profile load nahi hua"),
    );
  }, [projectId]);

  const changes = useMemo(
    () =>
      Object.fromEntries(
        PROJECT_CONTACT_KEYS.filter(
          (key) => !valuesEqual(profile[key], saved[key]),
        ).map((key) => [key, profile[key]]),
      ),
    [profile, saved],
  );
  const dirty = Object.keys(changes).length > 0;
  const missing = PROJECT_REQUIRED_CONTACT_KEYS.filter(
    (key) => !profile[key].trim(),
  );
  const effectiveMapUrl = projectMapFallbackUrl(profile);
  const usingPrimaryWhatsApp = !profile.whatsapp.trim();

  function setField(key: ProjectContactKey, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!dirty || busy) {
      if (!dirty) notify("Koi naya profile change nahi hai");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/project-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, changes }),
      });
      const data = (await response.json()) as ApiState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Project profile save nahi hua");
      const next = data.profile || profile;
      setProfile(next);
      setSaved(next);
      window.dispatchEvent(
        new CustomEvent("rekixo:project-profile-updated", {
          detail: { projectId },
        }),
      );
      notify("Project profile save ho gaya — Client Admin aur public site sync hain");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Project profile save nahi hua");
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return <section className="card rekixo-profile-panel">Project profile load ho raha hai…</section>;

  return (
    <section className="card rekixo-profile-panel">
      <div className="rekixo-profile-head">
        <div>
          <p>CANONICAL PROJECT PROFILE</p>
          <h2>{projectName}</h2>
          <span>
            Yahin ki values Client Admin aur customer website dono use karte hain.
          </span>
        </div>
        <div className={missing.length ? "rekixo-profile-readiness warn" : "rekixo-profile-readiness ready"}>
          {missing.length ? <AlertCircle /> : <CheckCircle2 />}
          {missing.length ? `${missing.length} required pending` : "Contact ready"}
        </div>
      </div>

      <div className="rekixo-profile-required-note">
        <b>Required before publish:</b> Location, full address aur primary phone.
        Optional fields blank reh sakte hain.
      </div>

      <div className="rekixo-profile-grid">
        <label className="wide">
          <span>{PROJECT_CONTACT_LABELS.location} *</span>
          <div className="rekixo-profile-input">
            <MapPin />
            <input
              value={profile.location}
              maxLength={220}
              onChange={(event) => setField("location", event.target.value)}
              placeholder="City / area / district"
            />
          </div>
        </label>

        <label className="wide">
          <span>{PROJECT_CONTACT_LABELS.address} *</span>
          <textarea
            rows={3}
            value={profile.address}
            maxLength={220}
            onChange={(event) => setField("address", event.target.value)}
            placeholder="Customer ko dikhne wala complete address"
          />
        </label>

        <label>
          <span>{PROJECT_CONTACT_LABELS.phone1} *</span>
          <div className="rekixo-profile-input">
            <Phone />
            <input
              type="tel"
              value={profile.phone1}
              onChange={(event) => setField("phone1", event.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>
        </label>

        <label>
          <span>{PROJECT_CONTACT_LABELS.phone2}</span>
          <input
            type="tel"
            value={profile.phone2}
            onChange={(event) => setField("phone2", event.target.value)}
            placeholder="Optional"
          />
        </label>

        <div className="wide rekixo-profile-field">
          <span>WhatsApp</span>
          <label className="rekixo-profile-toggle-row">
            <input
              type="checkbox"
              checked={usingPrimaryWhatsApp}
              onChange={(event) =>
                setField(
                  "whatsapp",
                  event.target.checked ? "" : profile.phone1,
                )
              }
            />
            <MessageCircle />
            <b>Primary phone ko WhatsApp ke liye use karein</b>
          </label>
          {!usingPrimaryWhatsApp ? (
            <input
              type="tel"
              value={profile.whatsapp}
              onChange={(event) => setField("whatsapp", event.target.value)}
              placeholder="+91 98765 43210"
            />
          ) : (
            <small>
              Effective WhatsApp: {profile.phone1 || "Primary phone add karein"}
            </small>
          )}
        </div>

        <label className="wide">
          <span>{PROJECT_CONTACT_LABELS.mapUrl}</span>
          <input
            type="url"
            value={profile.mapUrl}
            onChange={(event) => setField("mapUrl", event.target.value)}
            placeholder="https://maps.app.goo.gl/..."
          />
          {!profile.mapUrl && effectiveMapUrl ? (
            <small>Blank rehne par full address se Google Maps link automatic banega.</small>
          ) : null}
        </label>

        <label className="wide">
          <span>{PROJECT_CONTACT_LABELS.brochureUrl}</span>
          <input
            type="url"
            value={profile.brochureUrl}
            onChange={(event) => setField("brochureUrl", event.target.value)}
            placeholder="https://..."
          />
          <small>Brochure na ho to blank chhodein; public button hidden rahega.</small>
        </label>
      </div>

      <div className="rekixo-profile-actions">
        <button className="primary" disabled={busy || !dirty} onClick={save}>
          <Save />
          {busy ? "Saving…" : dirty ? "Save Project Profile" : "Profile Saved"}
        </button>
        <span>{dirty ? `${Object.keys(changes).length} field changed` : "No unsaved changes"}</span>
      </div>
    </section>
  );
}
