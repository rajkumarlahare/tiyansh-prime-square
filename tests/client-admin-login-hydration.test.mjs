import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("shared-domain framework assets try exact then stripped static asset before app handler",async()=>{
  const worker=await source("../worker/index.ts");

  assert.match(worker,/function fetchAssetCandidate/);
  assert.match(worker,/return await env\.ASSETS\.fetch\(request\)/);
  assert.match(worker,/const exact = await fetchAssetCandidate\(request, env\)/);
  assert.match(worker,/const strippedRequest=stripSharedAssetPrefix\(request\)/);
  assert.match(worker,/const fallback=await fetchAssetCandidate\(strippedRequest,env\)/);
  assert.match(worker,/frameworkAssetUsable/);
  assert.match(worker,/text\/html/);

  const exactIndex=worker.indexOf("const exact = await fetchAssetCandidate(request, env)");
  const strippedIndex=worker.indexOf("const strippedRequest=stripSharedAssetPrefix(request)");
  const fallbackIndex=worker.indexOf("const fallback=await fetchAssetCandidate(strippedRequest,env)");
  const handlerIndex=worker.indexOf("response = await handler.fetch(internalRequest, env, ctx)");

  assert.ok(exactIndex>=0);
  assert.ok(strippedIndex>exactIndex);
  assert.ok(fallbackIndex>strippedIndex);
  assert.ok(handlerIndex>fallbackIndex);
});

test("client login has secure native POST fallback when React hydration is unavailable",async()=>{
  const form=await source("../app/admin/login/login-form.tsx");

  assert.match(form,/<form action="\/api\/admin\/login" method="post" onSubmit=\{submit\}/);
  for(const field of ["projectId","projectSlug","successPath","changePasswordPath","returnPath"]){
    assert.ok(form.includes(`name="${field}"`),`missing native fallback field ${field}`);
  }
  assert.match(form,/type=\{show \? "text" : "password"\}/);
  assert.match(form,/type="button"/);
  assert.match(form,/initialError/);
});

test("login API supports JSON plus form POST without moving passwords into query strings",async()=>{
  const route=await source("../app/api/admin/login/route.ts");

  assert.match(route,/application\/x-www-form-urlencoded/);
  assert.match(route,/request\.formData\(\)/);
  assert.match(route,/status:303/);
  assert.match(route,/"set-cookie":cookie/);
  assert.match(route,/sameOrigin\(request\)/);
  assert.match(route,/MAX=5/);
  assert.match(route,/WINDOW=15\*60\*1000/);
  assert.doesNotMatch(route,/searchParams\.get\("password"\)/);
});

test("server-rendered login pages surface native-fallback errors",async()=>{
  const [shared,root]=await Promise.all([
    source("../app/projects/[slug]/admin-login/page.tsx"),
    source("../app/admin/login/page.tsx"),
  ]);

  for(const page of [shared,root]){
    assert.match(page,/searchParams/);
    assert.match(page,/loginError/);
    assert.match(page,/initialError/);
  }
});

test("password generation, reset and hashing scope are outside the hydration fix",async()=>{
  const [policy,manager,users,auth]=await Promise.all([
    source("../app/client-password-policy.ts"),
    source("../app/client-admin-manager.tsx"),
    source("../app/api/admin/users/route.ts"),
    source("../app/admin-auth.ts"),
  ]);

  assert.match(policy,/CLIENT_PASSWORD_MIN_LENGTH = 8/);
  assert.match(manager,/generateTemporaryClientPassword/);
  assert.match(users,/validClientPassword/);
  assert.match(auth,/PBKDF2/);
  assert.match(auth,/iterations:100000/);
});
