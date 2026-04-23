const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");
const { spawn } = require("node:child_process");

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = require("node:fs").createWriteStream(destination);
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          return resolve(downloadFile(response.headers.location, destination));
        }

        if (response.statusCode !== 200) {
          file.close();
          return reject(new Error(`Download failed with status ${response.statusCode}`));
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (error) => {
        file.close();
        reject(error);
      });
  });
}

function runPowerShell(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false, windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`PowerShell command failed with code ${code}`));
      }
    });
  });
}

async function findContentRoot(extractDir) {
  const firstLevel = await fs.readdir(extractDir, { withFileTypes: true });
  if (firstLevel.length === 1 && firstLevel[0].isDirectory()) {
    return path.join(extractDir, firstLevel[0].name);
  }

  return extractDir;
}

async function bootstrap() {
  if (process.platform !== "win32") {
    return;
  }

  const packageRoot = path.resolve(__dirname, "..", "node_modules", "@xpack-dev-tools", "mingw-w64-gcc");

  try {
    await fs.access(packageRoot);
  } catch {
    return;
  }

  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));

  const binaries = packageJson?.xpack?.binaries;
  const platformKey = `${process.platform}-${process.arch}`;
  const platformInfo = binaries?.platforms?.[platformKey];

  if (!binaries || !platformInfo) {
    return;
  }

  const destinationDir = path.join(packageRoot, binaries.destination || ".content");
  const gccPath = path.join(destinationDir, "bin", process.arch === "x64" ? "x86_64-w64-mingw32-gcc.exe" : "i686-w64-mingw32-gcc.exe");

  try {
    await fs.access(gccPath);
    return;
  } catch {
    // Continue bootstrap.
  }

  await fs.mkdir(destinationDir, { recursive: true });

  const tempRoot = path.join(packageRoot, ".bootstrap-temp");
  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.mkdir(tempRoot, { recursive: true });

  const archivePath = path.join(tempRoot, platformInfo.fileName);
  const archiveUrl = `${binaries.baseUrl}/${platformInfo.fileName}`;

  console.log(`[kindred] Downloading bundled MinGW from ${archiveUrl}`);
  await downloadFile(archiveUrl, archivePath);

  const extractDir = path.join(tempRoot, "extract");
  await fs.mkdir(extractDir, { recursive: true });

  await runPowerShell("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`]);

  const contentRoot = await findContentRoot(extractDir);
  await fs.cp(contentRoot, destinationDir, { recursive: true, force: true });

  await fs.rm(tempRoot, { recursive: true, force: true });
  console.log("[kindred] Bundled MinGW compiler is ready.");
}

bootstrap().catch((error) => {
  console.warn(`[kindred] Bundled compiler bootstrap skipped: ${error.message}`);
});
