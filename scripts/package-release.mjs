import { createWriteStream } from "node:fs";
import { chmodSync, existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..");

const defaultTarget = `${process.platform}-${process.arch}`;
const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
const target = targetArg ? targetArg.slice("--target=".length) : defaultTarget;
const nodeVersion = process.env.BUNDLE_NODE_VERSION ?? process.versions.node;
const releaseRoot = path.join(repoRoot, "release");
const bundleName = `llm-intervene-${target}-node-v${nodeVersion}`;
const bundleDir = path.join(releaseRoot, bundleName);
const appRoot = path.join(bundleDir, "app");
const runtimeRoot = path.join(bundleDir, "runtime");
const serverAppDir = path.join(appRoot, "apps", "server");
const webAppDir = path.join(appRoot, "apps", "web");
const sharedPackageDir = path.join(appRoot, "node_modules", "@llm-intervene", "shared");

const serverDependencies = {
  ajv: "^8.17.1",
  cors: "^2.8.5",
  express: "^4.21.2"
};

const targetConfigMap = {
  "darwin-arm64": {
    archiveType: "tar.gz",
    filename: `node-v${nodeVersion}-darwin-arm64.tar.gz`
  },
  "darwin-x64": {
    archiveType: "tar.gz",
    filename: `node-v${nodeVersion}-darwin-x64.tar.gz`
  },
  "linux-x64": {
    archiveType: "tar.xz",
    filename: `node-v${nodeVersion}-linux-x64.tar.xz`
  },
  "win32-x64": {
    archiveType: "zip",
    filename: `node-v${nodeVersion}-win-x64.zip`
  }
};

const targetConfig = targetConfigMap[target];

if (!targetConfig) {
  console.error(`Unsupported target: ${target}`);
  console.error(`Supported targets: ${Object.keys(targetConfigMap).join(", ")}`);
  process.exit(1);
}

const log = (message) => console.log(`[package-release] ${message}`);

const removeIfExists = async (targetPath) => {
  if (existsSync(targetPath)) {
    await fs.rm(targetPath, { recursive: true, force: true });
  }
};

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const run = (command, args, options = {}) => {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options
  });
};

const writeExecutableFile = async (filePath, content) => {
  await fs.writeFile(filePath, content, "utf8");
  chmodSync(filePath, 0o755);
};

const downloadFile = async (url, destination) => {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download runtime from ${url}`);
  }

  await pipeline(response.body, createWriteStream(destination));
};

const extractRuntime = async (archivePath, extractionDir) => {
  await ensureDir(extractionDir);

  if (targetConfig.archiveType === "zip") {
    run("unzip", ["-q", archivePath, "-d", extractionDir]);
  } else {
    run("tar", ["-xf", archivePath, "-C", extractionDir]);
  }

  const extractedEntries = await fs.readdir(extractionDir);
  const extractedRootName = extractedEntries.find((entry) => entry.startsWith(`node-v${nodeVersion}`));
  if (!extractedRootName) {
    throw new Error("Unable to locate extracted Node runtime directory.");
  }

  const extractedRootPath = path.join(extractionDir, extractedRootName);
  const normalizedRuntimePath = path.join(runtimeRoot, "node");

  await removeIfExists(normalizedRuntimePath);
  await fs.rename(extractedRootPath, normalizedRuntimePath);
};

const createRuntimeWrappers = async () => {
  const unixStart = `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PORT="\${PORT:-3001}"
cd "$SCRIPT_DIR/app"
"$SCRIPT_DIR/runtime/node/bin/node" apps/server/dist/index.js
`;

  const unixNpm = `#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/runtime/node/bin/npm" "$@"
`;

  const windowsStart = `@echo off
set SCRIPT_DIR=%~dp0
if "%PORT%"=="" set PORT=3001
cd /d "%SCRIPT_DIR%app"
"%SCRIPT_DIR%runtime\\node\\node.exe" apps\\server\\dist\\index.js
`;

  const windowsNpm = `@echo off
set SCRIPT_DIR=%~dp0
"%SCRIPT_DIR%runtime\\node\\npm.cmd" %*
`;

  await writeExecutableFile(path.join(bundleDir, "start.sh"), unixStart);
  await writeExecutableFile(path.join(bundleDir, "npm.sh"), unixNpm);
  await fs.writeFile(path.join(bundleDir, "start.bat"), windowsStart, "utf8");
  await fs.writeFile(path.join(bundleDir, "npm.bat"), windowsNpm, "utf8");
};

const createDeploymentReadme = async () => {
  const content = `# LLM Intervene Deployment Bundle

## Included

- Portable Node.js runtime with npm: v${nodeVersion}
- Server build output
- Web frontend build output
- Production Node dependencies

## Start

### macOS / Linux

\`\`\`bash
./start.sh
\`\`\`

### Windows

\`\`\`bat
start.bat
\`\`\`

Service default URL:

\`\`\`
http://localhost:3001
\`\`\`

## Use bundled npm

### macOS / Linux

\`\`\`bash
./npm.sh -v
\`\`\`

### Windows

\`\`\`bat
npm.bat -v
\`\`\`

## Notes

- Frontend static assets are hosted by the server directly.
- If port 3001 is occupied, set environment variable \`PORT\` before startup.
- Runtime path: \`runtime/node\`
`;

  await fs.writeFile(path.join(bundleDir, "README-DEPLOY.md"), content, "utf8");
};

const createArchive = async () => {
  const archiveName = `${bundleName}.${target.startsWith("win32") ? "zip" : "tar.gz"}`;
  const archivePath = path.join(releaseRoot, archiveName);
  await removeIfExists(archivePath);

  if (target.startsWith("win32")) {
    run("zip", ["-qry", archivePath, bundleName], { cwd: releaseRoot });
  } else {
    run("tar", ["-czf", archivePath, bundleName], { cwd: releaseRoot });
  }

  return archivePath;
};

const main = async () => {
  log("Building application...");
  run("npm", ["run", "build"]);

  log("Preparing bundle directory...");
  await ensureDir(releaseRoot);
  await removeIfExists(bundleDir);
  await ensureDir(serverAppDir);
  await ensureDir(webAppDir);
  await ensureDir(sharedPackageDir);
  await ensureDir(runtimeRoot);

  log("Copying application build output...");
  await fs.cp(path.join(repoRoot, "apps", "server", "dist"), path.join(serverAppDir, "dist"), { recursive: true });
  await fs.cp(path.join(repoRoot, "apps", "web", "dist"), path.join(webAppDir, "dist"), { recursive: true });
  await fs.cp(path.join(repoRoot, "packages", "shared", "dist"), path.join(sharedPackageDir, "dist"), {
    recursive: true
  });

  await fs.writeFile(
    path.join(appRoot, "package.json"),
    JSON.stringify(
      {
        name: "llm-intervene-runtime",
        version: "0.1.0",
        private: true,
        type: "module",
        dependencies: serverDependencies
      },
      null,
      2
    ),
    "utf8"
  );

  await fs.writeFile(
    path.join(sharedPackageDir, "package.json"),
    JSON.stringify(
      {
        name: "@llm-intervene/shared",
        version: "0.1.0",
        private: true,
        type: "module",
        main: "dist/index.js",
        types: "dist/index.d.ts",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js"
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  log("Installing production dependencies into bundle...");
  run("npm", ["install", "--omit=dev", "--ignore-scripts"], { cwd: appRoot });

  log(`Downloading bundled Node.js runtime v${nodeVersion} for ${target}...`);
  const runtimeUrl = `https://nodejs.org/dist/v${nodeVersion}/${targetConfig.filename}`;
  const tempArchivePath = path.join(os.tmpdir(), targetConfig.filename);
  await removeIfExists(tempArchivePath);
  await downloadFile(runtimeUrl, tempArchivePath);

  log("Extracting runtime...");
  const tempExtractionDir = path.join(os.tmpdir(), `llm-intervene-runtime-${Date.now()}`);
  await removeIfExists(tempExtractionDir);
  await extractRuntime(tempArchivePath, tempExtractionDir);
  await removeIfExists(tempExtractionDir);
  await removeIfExists(tempArchivePath);

  log("Creating start scripts and deployment guide...");
  await createRuntimeWrappers();
  await createDeploymentReadme();

  log("Creating compressed archive...");
  const archivePath = await createArchive();

  log(`Bundle directory ready: ${bundleDir}`);
  log(`Archive ready: ${archivePath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
