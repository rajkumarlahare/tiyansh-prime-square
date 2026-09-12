import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoots = [
  "app",
  "build",
  "components",
  "db",
  "hooks",
  "lib",
  "worker",
];
const rootFiles = [
  "drizzle.config.ts",
  "next.config.ts",
  "vite.config.ts",
];
const sourceExtensions = new Set([".ts", ".tsx"]);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(path)));
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function formatDiagnostic(diagnostic, fallbackFile) {
  const file = diagnostic.file;
  const message = ts.flattenDiagnosticMessageText(
    diagnostic.messageText,
    "\n",
  );

  if (!file || diagnostic.start == null) {
    return `${relative(projectRoot, fallbackFile)}: ${message}`;
  }

  const position = file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${relative(projectRoot, file.fileName)}:${position.line + 1}:${position.character + 1}: ${message}`;
}

const files = [
  ...(await Promise.all(
    sourceRoots.map((directory) => collect(join(projectRoot, directory))),
  )).flat(),
  ...rootFiles.map((file) => join(projectRoot, file)),
].sort();

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
};

const failures = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions,
    fileName: file,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  for (const diagnostic of errors) {
    failures.push(formatDiagnostic(diagnostic, file));
  }
}

if (failures.length) {
  console.error("Source syntax verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Source syntax OK (${files.length} TypeScript/TSX files).`);
