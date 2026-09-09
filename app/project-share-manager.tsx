"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const SHARE_TEMPLATE = "ar3d-standard-v1";
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const MAX_COVER_BYTES = 12 * 1024 * 1024;

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
    // Cloudflare can send plain text on infrastructure errors.
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

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load nahi hui"));
    image.src = src;
  });
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const targetWidth = image.naturalWidth * scale;
  const targetHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + (width - targetWidth) / 2,
    y + (height - targetHeight) / 2,
    targetWidth,
    targetHeight,
  );
}

async function prepareProjectLogo(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type))
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

function validateCover(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Cover JPG, PNG ya WebP me choose karein");
  if (file.size > MAX_COVER_BYTES)
    throw new Error("Cover image 12 MB se chhoti rakhein");
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
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function load() {
    const response = await fetch(
      `/api/admin/project-share?projectId=${encodeURIComponent(projectId)}`,
      { cache: "no-store" },
    );
    const data = (await apiJson(response)) as ShareState;
    setState(data);
    setTitle(data.shareTitle || data.projectName || "");
    setDescription(data.shareDescription || "");
    setLocalPreview("");
  }

  useEffect(() => {
    load().catch((error) =>
      notify(error instanceof Error ? error.message : "Share profile load nahi hua"),
    );
  }, [projectId]);

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

  async function renderCard() {
    if (!coverFile) throw new Error("Pehle cover image choose karein");
    validateCover(coverFile);
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Preview canvas ready nahi hai");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Preview generate nahi ho paya");

    const coverUrl = URL.createObjectURL(coverFile);
    try {
      const cover = await loadImage(coverUrl);
      const logo = state.logoUrl
        ? await loadImage(state.logoUrl).catch(() => null)
        : null;

      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      context.fillStyle = "#07101f";
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      drawCover(context, cover, 0, 0, CANVAS_WIDTH, 552);

      const gradient = context.createLinearGradient(0, 270, 0, 552);
      gradient.addColorStop(0, "rgba(3,8,18,0)");
      gradient.addColorStop(1, "rgba(3,8,18,0.72)");
      context.fillStyle = gradient;
      context.fillRect(0, 250, CANVAS_WIDTH, 302);

      if (logo) {
        context.fillStyle = "rgba(255,255,255,0.97)";
        context.beginPath();
        context.roundRect(44, 42, 206, 206, 26);
        context.fill();
        drawContain(context, logo, 64, 62, 166, 166);
      }

      context.fillStyle = "rgba(6,13,25,0.96)";
      context.fillRect(0, 552, CANVAS_WIDTH, 78);
      context.fillStyle = "#f0b323";
      context.font = "800 29px Arial, sans-serif";
      context.fillText("AR 3D VISION", 48, 601);
      context.fillStyle = "#d7deea";
      context.font = "600 22px Arial, sans-serif";
      const label = "INTERACTIVE PROJECT PREVIEW";
      const labelWidth = context.measureText(label).width;
      context.fillText(label, CANVAS_WIDTH - labelWidth - 48, 601);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setLocalPreview(dataUrl);
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Card encode nahi hua"))),
          "image/jpeg",
          0.9,
        ),
      );
    } finally {
      URL.revokeObjectURL(coverUrl);
    }
  }

  async function generatePreview() {
    try {
      await renderCard();
      notify("Preview ready hai");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Preview generate nahi hua");
    }
  }

  async function generateAndSave() {
    if (!validDetails) {
      notify("Title kam se kam 3 aur description 10 characters rakhein");
      return;
    }
    setBusy(true);
    try {
      const blob = await renderCard();
      if (blob.size > 2 * 1024 * 1024)
        throw new Error("Generated share card bahut bada hai");
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("kind", "card");
      form.set("shareTemplate", SHARE_TEMPLATE);
      form.set("shareTitle", title.trim());
      form.set("shareDescription", description.trim());
      form.set(
        "file",
        new File([blob], "share-card.jpg", { type: "image/jpeg" }),
      );

      const data = (await apiJson(
        await fetch("/api/admin/project-share", {
          method: "POST",
          body: form,
        }),
      )) as ShareState;
      setState((current) => ({ ...current, ...data }));
      setLocalPreview("");
      dispatchShareUpdate(projectId);
      notify("Share card generate ho kar save ho gaya");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Share card save nahi hua");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!canCopyShare) {
      notify(
        published
          ? "Pehle share card generate karein"
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
            Ek reusable 1200×630 card, project metadata aur fresh versioned link.
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
          {state.cardUrl ? "Share card ready" : "Share card pending"}
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
            <span>CARD COVER IMAGE</span>
            <label className="rekixo-cover-picker">
              <ImagePlus />
              <b>{coverFile ? coverFile.name : "Choose cover image"}</b>
              <small>JPG / PNG / WebP · max 12 MB</small>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (!file) return;
                  try {
                    validateCover(file);
                    setCoverFile(file);
                    setLocalPreview("");
                  } catch (error) {
                    notify(
                      error instanceof Error ? error.message : "Cover invalid hai",
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
            <button onClick={generatePreview} disabled={busy || !coverFile}>
              <ImagePlus /> Generate preview
            </button>
            <button
              className="primary"
              onClick={generateAndSave}
              disabled={busy || !coverFile || !validDetails}
            >
              <ImagePlus /> {busy ? "Generating…" : "Generate & save card"}
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
              <img src={previewUrl} alt="Share card preview" />
            ) : (
              <div className="rekixo-share-empty">
                Cover choose karke preview generate karein
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

      <canvas ref={canvasRef} hidden />
    </section>
  );
}
