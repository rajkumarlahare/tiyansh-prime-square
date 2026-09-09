"use client";

import { Building2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { LOGIN_CRITICAL_CSS } from "./login-critical";

type LoginFormProps = {
  mode: "super" | "client";
  projectId?: string;
  projectSlug?: string;
  projectName?: string;
  successPath?: string;
  changePasswordPath?: string;
  backPath?: string;
  initialError?: string;
};

export default function LoginForm({
  mode,
  projectId = "",
  projectSlug = "",
  projectName = "",
  successPath = "/admin",
  changePasswordPath = "/admin/change-password",
  backPath = "",
  initialError = "",
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const isSuper = mode === "super";
  const tenantLabel = projectName.trim() || projectSlug.trim() || "Your project";
  const resolvedBackPath =
    backPath || (projectSlug ? `/projects/${encodeURIComponent(projectSlug)}` : "/");
  const resolvedLoginPath = projectSlug
    ? `/projects/${encodeURIComponent(projectSlug)}/admin-login`
    : "/admin/login";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, projectId, projectSlug }),
      });
      const result = await response.json().catch(() => ({ error: "Login failed" }));
      if (response.ok) {
        location.replace(result.mustChangePassword ? changePasswordPath : successPath);
        return;
      }
      setError(result.error || "Login failed");
    } catch {
      setError("Network error. Dobara try karein.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Critical UI must survive a broken/delayed external stylesheet request. */}
      <style data-rekixo-login-critical>{LOGIN_CRITICAL_CSS}</style>
      <main className="login-page" data-rekixo-login>
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-icon" aria-hidden="true"><Building2 /></div>
          <h1 id="login-title">{isSuper ? "Rekixo Super Admin" : "Client Admin"}</h1>
          <p className="login-context">
            {isSuper ? "Central client & project management" : <>Project: <b>{tenantLabel}</b></>}
          </p>

          <form action="/api/admin/login" method="post" onSubmit={submit} aria-busy={busy}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="projectSlug" value={projectSlug} />
            <input type="hidden" name="successPath" value={successPath} />
            <input type="hidden" name="changePasswordPath" value={changePasswordPath} />
            <input type="hidden" name="returnPath" value={resolvedLoginPath} />
            <label htmlFor="login-email">
              <span>EMAIL ADDRESS</span>
              <div className="login-input">
                <Mail aria-hidden="true" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={isSuper ? "owner@rekixo.com" : "client@example.com"}
                />
              </div>
            </label>

            <label htmlFor="login-password">
              <span>PASSWORD</span>
              <div className="login-input">
                <LockKeyhole aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            {error ? <div className="login-error" role="alert" aria-live="polite">{error}</div> : null}
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? "Signing in…" : isSuper ? "Sign In as Super Admin" : "Sign In to Dashboard"}
            </button>
          </form>

          {!isSuper ? <a className="back-link" href={resolvedBackPath}>← Back to Project</a> : null}
        </section>
      </main>
    </>
  );
}
