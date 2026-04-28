const fs = require("node:fs");
const path = require("node:path");
const { rcedit } = require("rcedit");

exports.default = async function applyWindowsIcon(context) {
  if (process.platform !== "win32") {
    return;
  }

  const executablePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, "kindred_logo.ico");

  if (!fs.existsSync(executablePath)) {
    throw new Error(`Packaged executable not found: ${executablePath}`);
  }

  if (!fs.existsSync(iconPath)) {
    throw new Error(`Icon file not found: ${iconPath}`);
  }

  await rcedit(executablePath, {
    icon: iconPath,
    "requested-execution-level": "asInvoker"
  });
};