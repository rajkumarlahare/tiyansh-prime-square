"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole } from "lucide-react";
import {
  CLIENT_PASSWORD_HINT,
  CLIENT_PASSWORD_MAX_LENGTH,
  CLIENT_PASSWORD_MIN_LENGTH,
} from "../../client-password-policy";
import { LOGIN_CRITICAL_CSS } from "../login/login-critical";

export default function ChangePasswordForm({
  email,
  projectName = "",
  successPath = "/admin",
}: {
  email: string;
  projectName?: string;
  successPath?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const data = await response.json().catch(() => ({ error: "Password change nahi hua" }));
      if (!response.ok) throw new Error(data.error || "Password change nahi hua");
      location.replace(successPath);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Password change nahi hua");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Auth screens own critical CSS so shared-domain stylesheet failures cannot expose raw forms. */}
      <style data-rekixo-login-critical>{LOGIN_CRITICAL_CSS}</style>
      <main className="login-page" data-rekixo-login>
        <section className="login-card" aria-labelledby="change-password-title">
          <div className="login-icon" aria-hidden="true"><KeyRound /></div>
          <h1 id="change-password-title">Create New Password</h1>
          <p className="login-context">
            {projectName ? <>Project: <b>{projectName}</b><br /></> : null}
            {email}<br />Temporary password ko apne password se replace karein.
          </p>

          <form onSubmit={submit} aria-busy={busy}>
            <label htmlFor="new-password">
              <span>NEW PASSWORD</span>
              <div className="login-input">
                <LockKeyhole aria-hidden="true" />
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={CLIENT_PASSWORD_MIN_LENGTH}
                  maxLength={CLIENT_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="8+ characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide new password" : "Show new password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            <label htmlFor="confirm-password">
              <span>CONFIRM PASSWORD</span>
              <div className="login-input">
                <LockKeyhole aria-hidden="true" />
                <input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  required
                  minLength={CLIENT_PASSWORD_MIN_LENGTH}
                  maxLength={CLIENT_PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Password dobara likhein"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((value) => !value)}
                  aria-label={showConfirm ? "Hide confirmed password" : "Show confirmed password"}
                >
                  {showConfirm ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>

            <small className="login-hint">{CLIENT_PASSWORD_HINT}</small>
            {error ? <div className="login-error" role="alert" aria-live="polite">{error}</div> : null}
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save New Password"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
