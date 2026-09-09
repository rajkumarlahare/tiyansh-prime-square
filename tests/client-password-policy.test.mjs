import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("central client password policy is 8+ chars, letter + number, special optional", async () => {
  const policy = await source("../app/client-password-policy.ts");
  assert.match(policy, /CLIENT_PASSWORD_MIN_LENGTH = 8/);
  assert.match(policy, /CLIENT_PASSWORD_MAX_LENGTH = 128/);
  assert.match(policy, /\/\[A-Za-z\]\/\.test\(value\)/);
  assert.match(policy, /\/\\d\/\.test\(value\)/);
  assert.match(policy, /!\/\\s\/\.test\(value\)/);
  assert.match(policy, /Special character optional/);
});

test("temporary client passwords are readable 8-char alphanumeric values", async () => {
  const policy = await source("../app/client-password-policy.ts");
  assert.match(policy, /length = CLIENT_PASSWORD_MIN_LENGTH/);
  assert.match(policy, /ABCDEFGHJKLMNPQRSTUVWXYZ/);
  assert.match(policy, /abcdefghijkmnopqrstuvwxyz/);
  assert.match(policy, /23456789/);
  assert.match(policy, /pick\(UPPER\)/);
  assert.match(policy, /pick\(LOWER\)/);
  assert.match(policy, /pick\(DIGITS\)/);
  assert.match(policy, /crypto\.getRandomValues/);
  assert.doesNotMatch(policy, /!@#\$%/);
});

test("Super Admin create and reset use the centralized temporary generator", async () => {
  const manager = await source("../app/client-admin-manager.tsx");
  assert.match(manager, /generateTemporaryClientPassword/);
  assert.equal((manager.match(/generateTemporaryClientPassword\(\)/g) || []).length, 2);
  assert.doesNotMatch(manager, /new Uint32Array\(18\)/);
  assert.doesNotMatch(manager, /23456789!@#\$%/);
});

test("Super Admin API create and reset use the same validation policy", async () => {
  const users = await source("../app/api/admin/users/route.ts");
  assert.match(users, /validClientPassword/);
  assert.equal((users.match(/validClientPassword\(password\)/g) || []).length, 2);
  assert.doesNotMatch(users, /const strongPassword=/);
  assert.doesNotMatch(users, /strong 12\+ character password/);
  assert.doesNotMatch(users, /special character जरूरी/);
});

test("first-login password change UI and API are synchronized to 8+ policy", async () => {
  const [route, form] = await Promise.all([
    source("../app/api/admin/change-password/route.ts"),
    source("../app/admin/change-password/password-form.tsx"),
  ]);
  assert.match(route, /validClientPassword\(password\)/);
  assert.doesNotMatch(route, /password\.length<12/);
  assert.doesNotMatch(route, /Uppercase, lowercase/);

  assert.match(form, /CLIENT_PASSWORD_MIN_LENGTH/);
  assert.match(form, /CLIENT_PASSWORD_MAX_LENGTH/);
  assert.match(form, /CLIENT_PASSWORD_HINT/);
  assert.match(form, /placeholder="8\+ characters"/);
  assert.doesNotMatch(form, /minLength=\{12\}/);
  assert.doesNotMatch(form, /12\+ characters/);
});

test("hashing and login throttling remain outside this patch", async () => {
  const [auth, login] = await Promise.all([
    source("../app/admin-auth.ts"),
    source("../app/api/admin/login/route.ts"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /iterations:100000/);
  assert.match(auth, /SHA-256/);
  assert.match(login, /WINDOW=15\*60\*1000,MAX=5/);
});
