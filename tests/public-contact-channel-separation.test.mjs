import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/project/index.html", import.meta.url), "utf8");

test("public customer site keeps Call and WhatsApp as independent contact channels", () => {
  assert.match(html, /REKIXO_CONTACT_CHANNEL_SEPARATION_V1/);
  assert.match(html, /let CALL_PHONE = GENERIC_BOOT\?'':'919009995582', WHATSAPP_PHONE = CALL_PHONE/);
  assert.doesNotMatch(html, /let PHONE =/);

  // A literal "\\n" after a // marker comments out the following declaration.
  // Guard the exact runtime line shape, not only the presence of the declaration text.
  assert.doesNotMatch(html, /REKIXO_CONTACT_CHANNEL_SEPARATION_V1\\\\n/);
  assert.match(html, /\/\/ REKIXO_CONTACT_CHANNEL_SEPARATION_V1\n\s*let CALL_PHONE/);
  const callDeclarationLine = html
    .split("\n")
    .find((line) => line.includes("let CALL_PHONE"));
  assert.ok(callDeclarationLine);
  assert.ok(!callDeclarationLine.trimStart().startsWith("//"));
});

test("Call always prefers primary phone then secondary phone, never WhatsApp", () => {
  assert.match(html, /const resolvedCall=primary\|\|secondary;/);
  assert.doesNotMatch(html, /resolvedCall=.*whatsapp/i);
  assert.match(html, /function call\(\)\{if\(!CALL_PHONE\)return toast\('Contact number not configured'\);location\.href='tel:\+'\+CALL_PHONE\}/);
  assert.match(html, /q\('#callTop'\)\.onclick=call;q\('#callBtn'\)\.onclick=call/);
});

test("WhatsApp prefers explicit WhatsApp number and falls back to phone1 then phone2", () => {
  assert.match(html, /const resolvedWhatsapp=explicitWhatsapp\|\|primary\|\|secondary;/);
  assert.match(html, /window\.open\('https:\/\/wa\.me\/'\+WHATSAPP_PHONE\+'\?text='/);
});

test("generic and default projects use the same centralized resolver", () => {
  assert.match(html, /function applyContactChannels\(settings,isDefaultProject\)/);
  assert.match(html, /applyContactChannels\(s,isTiyansh\);/);
  assert.doesNotMatch(html, /s\.whatsapp\|\|s\.phone1\|\|PHONE/);
});

test("contact-channel fix does not touch map geometry or presentation controls", () => {
  assert.match(html, /function pointInPolygon\(/);
  assert.match(html, /matrixTransform\(ctm\.inverse\(\)\)/);
  assert.match(html, /id="amenitiesBtn"/);
  assert.match(html, /id="galleryBtn"/);
  assert.match(html, /id="locationBtn"/);
});
