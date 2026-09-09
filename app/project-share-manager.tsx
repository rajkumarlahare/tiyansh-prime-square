"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Save,
  Share2,
  Upload,
} from "lucide-react";

type ShareState = {
  projectId?: string;
  projectName?: string;
  publicStatus?: string;
  shareTitle?: string;
  shareDescription?: string;
  shareVersion?: string;
  shareTemplate?: string;
  logoUrl?: string;
  cardUrl?: string;
  shareUrl?: string;
  publicUrl?: string;
};

const SHARE_TEMPLATE = "original-image-v1";
const MAX_SHARE_IMAGE_BYTES = 8 * 1024 * 1024;
const SHARE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function dispatchShareUpdate(projectId: string) {
  window.dispatchEvent(
    new CustomEvent("rekixo:share-profile-updated", {
      detail: { projectId },
    }),
  );
}

async function apiJson(response: Response) {
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    // Cloudflare can return plain text on infrastructure errors.
  }
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : raw.trim() || `Request failed (${response.status})`,
    );
  }
  return data;
}

async function prepareProjectLogo(file: File) {
  if (!SHARE_IMAGE_TYPES.includes(file.type))
    throw new Error("Logo JPG, PNG ya WebP me upload karein");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Logo 8 MB se chhota rakhein");

  const bitmap = await createImageBitmap(file);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    bitmap.close();
    throw new Error("Logo process nahi ho paya");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
  let blob: Blob | null = null;
  for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54]) {
    blob = await encode(quality);
    if (blob && blob.size <= 180 * 1024) break;
  }
  if (!blob || blob.size > 512 * 1024)
    throw new Error("Logo optimize nahi ho paya");

  return new File([blob], "project-logo.webp", { type: "image/webp" });
}

function validateShareImage(file: File) {
  if (!SHARE_IMAGE_TYPES.includes(file.type))
    throw new Error("Share image JPG, PNG ya WebP me choose karein");
  if (!file.size)
    throw new Error("Share image empty hai");
  if (file.size > MAX_SHARE_IMAGE_BYTES)
    throw new Error("Share image 8 MB se chhoti rakhein");
}

export default function ProjectShareManager({
  projectId,
  notify,
}: {
  projectId: string;
  notify: (message: string) => void;
}) {
  const [state, setState] = useState<ShareState>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [shareImageFile, setShareImageFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  async function load() {
    const response = await fetch(
      `/api/admin/project-share?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );
    const data = (await apiJson(response)) as ShareState;
    setState(data);
    setTitle(data.shareTitle || data.projectName || "");
    setDescription(data.shareDescription || "");
  }

  useEffect(() => {
    setShareImageFile(null);
    load().catch((error) =>
      notify(error instanceof Error ? error.message : "Share profile load nahi hua"),
    );
  }, [projectId]);

  useEffect(() => {
    if (!shareImageFile) {
      setLocalPreview("");
      return;
    }
    const objectUrl = URL.createObjectURL(shareImageFile);
    setLocalPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [shareImageFile]);

  const shareUrl = state.shareUrl || state.publicUrl || "";
  const previewUrl = localPreview || state.cardUrl || "";
  const shareHost = useMemo(() => {
    try {
      return shareUrl ? new URL(shareUrl).host : "";
    } catch {
      return "";
    }
  }, [shareUrl]);
  const published = state.publicStatus === "published";
  const canCopyShare = Boolean(published && state.cardUrl && shareUrl);
  const validDetails =
    title.trim().length >= 3 && description.trim().length >= 10;

  async function uploadLogo(file: File | undefined) {
    if (!file || logoBusy) return;
    setLogoBusy(true);
    try {
      const optimized = await prepareProjectLogo(file);
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("kind", "logo");
      form.set("file", optimized);
      await apiJson(
        await fetch("/api/super-mapper", {
          method: "POST",
          body: form,
        }),
      );
      await load();
      dispatchShareUpdate(projectId);
      notify("Project logo update ho gaya");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Logo update nahi hua");
    } finally {
      setLogoBusy(false);
    }
  }

  async function saveDetails() {
    if (!validDetails) {
      notify("Title kam se kam 3 aur description 10 characters rakhein");
      return;
    }
    setBusy(true);
    try {
      const data = (await apiJson(
        await fetch("/api/admin/project-share", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId,
            shareTitle: title,
            shareDescription: description,
          }),
        }),
      )) as ShareState;
      setState((current) => ({ ...current, ...data }));
      dispatchShareUpdate(projectId);
      notify("Share details save ho gaye");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Share details save nahi hue");
    } finally {
      setBusy(false);
    }
  }

  async function saveShareImage() {
    if (!validDetails) {
      notify("Title kam se kam 3 aur description 10 characters rakhein");
      return;
    }
    if (!shareImageFile) {
      notify("Pehle final share image choose karein");
      return;
    }

    try {
      validateShareImage(shareImageFile);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Share image invalid hai");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("kind", "card");
      form.set("shareTemplate", SHARE_TEMPLATE);
      form.set("shareTitle", title.trim());
      form.set("shareDescription", description.trim());

      // Important: upload the user's final poster directly.
      // Do not crop, resize, redraw, overlay a logo, or burn AR3D branding into it.
      form.set("file", shareImageFile);

      const data = (await apiJson(
        await fetch("/api/admin/project-share", {
          method: "POST",
          body: form,
        }),
      )) as ShareState;

      setState((current) => ({ ...current, ...data }));
      setShareImageFile(null);
      dispatchShareUpdate(projectId);
      notify("Original share image save ho gayi");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Share image save nahi hui");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!canCopyShare) {
      notify(
        published
          ? "Pehle share image save karein"
          : "Project publish hone ke baad share link copy hoga",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      notify("Share link copy ho gaya");
    } catch {
      notify("Clipboard copy fail hua");
    }
  }

  return (
    <section className="card rekixo-share-panel">
      <div className="section-title">
        <Share2 />
        <div>
          <h2>Share & Branding</h2>
          <p>
            Final customer poster ko as-is use karein. System image ko crop,
            redesign ya logo-overlay nahi karega.
          </p>
        </div>
      </div>

      <div className="rekixo-share-status">
        <span className={state.logoUrl ? "ready" : "warn"}>
          {state.logoUrl ? <CheckCircle2 /> : <Upload />}
          {state.logoUrl ? "Project logo linked" : "Project logo optional"}
        </span>
        <span className={state.cardUrl ? "ready" : "warn"}>
          {state.cardUrl ? <CheckCircle2 /> : <ImagePlus />}
          {state.cardUrl ? "Original share image ready" : "Share image pending"}
        </span>
        <span className={published ? "ready" : "warn"}>
          {published ? <CheckCircle2 /> : <Share2 />}
          {published ? "Link share-ready" : "Project draft"}
        </span>
      </div>

      <div className="rekixo-share-layout">
        <div className="rekixo-share-fields">
          <label>
            <span>PROJECT LOGO</span>
            <div className="rekixo-share-logo-row">
              {state.logoUrl ? (
                <img src={state.logoUrl} alt="Project logo" />
              ) : (
                <div className="rekixo-share-logo-empty">LOGO</div>
              )}
              <label className="rekixo-file-button">
                <Upload /> {logoBusy ? "Uploading…" : "Upload / replace logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={logoBusy}
                  onChange={(event) => uploadLogo(event.target.files?.[0])}
                />
              </label>
            </div>
          </label>

          <label>
            <span>SHARE TITLE</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="Project name / headline"
            />
            <small>{title.length}/120</small>
          </label>

          <label>
            <span>SHARE DESCRIPTION</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={280}
              placeholder="Short project description"
            />
            <small>{description.length}/280</small>
          </label>

          <label>
            <span>SHARE IMAGE / WHATSAPP POSTER</span>
            <label className="rekixo-cover-picker">
              <ImagePlus />
              <b>
                {shareImageFile
                  ? shareImageFile.name
                  : state.cardUrl
                    ? "Choose a new image to replace the current poster"
                    : "Choose final share image"}
              </b>
              <small>
                JPG / PNG / WebP · max 8 MB · original aspect ratio · no crop
              </small>
              <input
                key={
                  shareImageFile
                    ? `${shareImageFile.name}-${shareImageFile.lastModified}`
                    : "share-image"
                }
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (!file) return;
                  try {
                    validateShareImage(file);
                    setShareImageFile(file);
                  } catch (error) {
                    notify(
                      error instanceof Error
                        ? error.message
                        : "Share image invalid hai",
                    );
                    event.currentTarget.value = "";
                  }
                }}
              />
            </label>
          </label>

          <div className="rekixo-share-actions">
            <button onClick={saveDetails} disabled={busy || !validDetails}>
              <Save /> {busy ? "Saving…" : "Save details"}
            </button>
            <button
              className="primary"
              onClick={saveShareImage}
              disabled={busy || !shareImageFile || !validDetails}
            >
              <ImagePlus /> {busy ? "Saving…" : "Save share image"}
            </button>
            <button onClick={copyLink} disabled={!canCopyShare}>
              <Copy /> Copy share link
            </button>
            {published && state.publicUrl ? (
              <a href={state.publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Open live project
              </a>
            ) : null}
          </div>
        </div>

        <div className="rekixo-whatsapp-shell">
          <div className="rekixo-whatsapp-head">LINK PREVIEW</div>
          <div className="rekixo-whatsapp-card">
            {previewUrl ? (
              <img src={previewUrl} alt="Share image preview" />
            ) : (
              <div className="rekixo-share-empty">
                Final poster choose karein. Yahan wahi image bina crop ke dikhai
                degi.
              </div>
            )}
            <div className="rekixo-whatsapp-copy">
              <b>{title || state.projectName || "Project"}</b>
              <p>{description || "Project description yahan dikhai degi."}</p>
              <small>{shareHost || "project-link"}</small>
            </div>
          </div>
          <div className="rekixo-share-link-box">
            <span>Versioned share link</span>
            <code>{shareUrl || "Publish/link configuration ke baad available"}</code>
          </div>
        </div>
      </div>
    </section>
  );
}
