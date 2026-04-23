const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");
const { spawn } = require("node:child_process");

const TCC_VERSION = "0.9.27";
const TCC_ARCHIVE = process.platform === "win32" && process.arch === "x64"
  ? "tcc-0.9.27-win64-bin.zip"
  : "tcc-0.9.27-win32-bin.zip";
const TCC_URL = `https://download.savannah.gnu.org/releases/tinycc/${TCC_ARCHIVE}`;

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

  const projectRoot = path.resolve(__dirname, "..");
  const destinationDir = path.join(projectRoot, "resources", "runtimes", "tcc", "bin", process.arch === "x64" ? "win64" : "win32");
  const tccPath = path.join(destinationDir, "tcc.exe");

  try {
    await fs.access(tccPath);
    return;
  } catch {
    // Continue bootstrap.
  }

  await fs.mkdir(destinationDir, { recursive: true });

  const tempRoot = path.join(projectRoot, "node_modules", ".kindred-tcc-temp");
  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.mkdir(tempRoot, { recursive: true });

  const archivePath = path.join(tempRoot, TCC_ARCHIVE);
  console.log(`[kindred] Downloading TinyCC ${TCC_VERSION} from ${TCC_URL}`);
  await downloadFile(TCC_URL, archivePath);

  const extractDir = path.join(tempRoot, "extract");
  await fs.mkdir(extractDir, { recursive: true });
  await runPowerShell("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`]);

  const contentRoot = await findContentRoot(extractDir);
  await fs.cp(contentRoot, destinationDir, { recursive: true, force: true });
  await fs.rm(tempRoot, { recursive: true, force: true });
  console.log(`[kindred] TinyCC compiler ready at ${tccPath}`);
}

bootstrap().catch((error) => {
  console.warn(`[kindred] TinyCC bootstrap skipped: ${error.message}`);
});
