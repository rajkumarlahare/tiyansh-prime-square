export const LOGIN_CRITICAL_CSS = String.raw`
html,
body {
  margin: 0;
  min-height: 100%;
  background: #030712;
}
.login-page,
.login-page * {
  box-sizing: border-box;
}
.login-page {
  min-height: 100vh;
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: clamp(24px, 5vw, 56px) 18px;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 50% 28%, rgba(62, 77, 139, 0.22), transparent 36%),
    radial-gradient(circle at 15% 85%, rgba(91, 84, 231, 0.07), transparent 30%),
    #030712;
  color: #f7f9ff;
  color-scheme: dark;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}
.login-card {
  width: min(100%, 560px);
  padding: 54px 48px 42px;
  border: 1px solid #20293b;
  border-radius: 28px;
  background: linear-gradient(180deg, #080d18 0%, #070c16 100%);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.48);
  text-align: center;
}
.login-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 22px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(245, 165, 36, 0.18);
  border-radius: 20px;
  background: rgba(245, 165, 36, 0.08);
  color: #f5a524;
}
.login-icon svg {
  width: 38px;
  height: 38px;
  stroke-width: 2;
}
.login-card h1 {
  margin: 0;
  color: #f9fbff;
  font-size: clamp(31px, 5vw, 38px);
  font-weight: 850;
  letter-spacing: -0.035em;
  line-height: 1.08;
}
.login-context {
  margin: 16px 0 38px;
  color: #7f8da7;
  font-size: 16px;
  line-height: 1.5;
}
.login-context b {
  color: #7775ff;
  font-weight: 850;
  overflow-wrap: anywhere;
}
.login-card form {
  text-align: left;
}
.login-card label {
  display: block;
  margin-bottom: 24px;
}
.login-card label > span {
  display: block;
  margin-bottom: 10px;
  color: #aab5ca;
  font-size: 13px;
  font-weight: 850;
  letter-spacing: 0.08em;
}
.login-input {
  min-height: 66px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #29344a;
  border-radius: 16px;
  background: #0e1420;
  padding: 0 17px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}
.login-input:focus-within {
  border-color: #696cff;
  background: #101725;
  box-shadow: 0 0 0 3px rgba(101, 105, 255, 0.14);
}
.login-input > svg {
  width: 21px;
  height: 21px;
  flex: 0 0 auto;
  color: #6f7d96;
}
.login-input input {
  min-width: 0;
  height: 64px;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f7f9ff;
  font: inherit;
  font-size: 16px;
}
.login-input input::placeholder {
  color: #7c879b;
  opacity: 1;
}
.login-input button {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #8996ac;
  cursor: pointer;
}
.login-input button:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #d8dfeb;
}
.login-input button:focus-visible,
.login-submit:focus-visible,
.back-link:focus-visible {
  outline: 3px solid rgba(119, 117, 255, 0.45);
  outline-offset: 3px;
}
.login-input button svg {
  width: 21px;
  height: 21px;
}
.login-error {
  margin: -7px 0 20px;
  padding: 12px 14px;
  border: 1px solid #713046;
  border-radius: 11px;
  background: #351621;
  color: #ff9aab;
  font-size: 13px;
  line-height: 1.45;
}
.login-submit {
  width: 100%;
  min-height: 62px;
  border: 0;
  border-radius: 15px;
  background: linear-gradient(135deg, #5f66ed, #7166f4);
  box-shadow: 0 12px 30px rgba(76, 81, 219, 0.24);
  color: #fff;
  font: inherit;
  font-size: 17px;
  font-weight: 850;
  cursor: pointer;
  transition: transform 0.14s ease, filter 0.14s ease, opacity 0.14s ease;
}
.login-submit:not(:disabled):active { transform: translateY(1px); }
.login-submit:not(:disabled):hover { filter: brightness(1.05); }
.login-submit:disabled { cursor: wait; opacity: 0.62; }
.back-link {
  display: inline-block;
  margin-top: 32px;
  color: #9aa7bd;
  font-size: 14px;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.back-link:hover { color: #fff; }
@media (max-width: 600px) {
  .login-page { padding: 22px 16px; }
  .login-card { padding: 44px 24px 36px; border-radius: 24px; }
  .login-icon { width: 66px; height: 66px; margin-bottom: 20px; border-radius: 18px; }
  .login-icon svg { width: 34px; height: 34px; }
  .login-context { margin-bottom: 32px; font-size: 15px; }
  .login-input { min-height: 62px; border-radius: 15px; }
  .login-input input { height: 60px; }
  .login-submit { min-height: 60px; }
}
@media (max-height: 720px) and (orientation: landscape) {
  .login-page { padding-block: 18px; }
  .login-card { padding-block: 30px; }
  .login-icon { width: 58px; height: 58px; margin-bottom: 14px; }
  .login-context { margin: 10px 0 24px; }
}
`;
