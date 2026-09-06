import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const source=path=>readFile(new URL(path,import.meta.url),"utf8");

test("plot mapper stores normalized tenant boundaries and project assets",async()=>{
  const [mapper,api,schema,website]=await Promise.all([source("../app/plot-mapper.tsx"),source("../app/api/mapper/route.ts"),source("../db/schema.ts"),source("../public/project/index.html")]);
  assert.match(mapper,/\(event\.clientX-box\.left\)\/box\.width/);
  assert.match(mapper,/mode==="rectangle"/);
  assert.match(api,/projects\/\$\{session\.projectId\}\/mapper/);
  assert.match(api,/image\/jpeg/);
  assert.match(api,/application\/pdf/);
  assert.match(schema,/polygon:text\("polygon"\)/);
  assert.match(website,/row\.polygon/);
  assert.match(website,/project-asset\/masterplan/);
});
