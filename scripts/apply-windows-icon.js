const fs = require("node:fs");
const path = require("node:path");
const { rcedit } = require("rcedit");

exports.default = async function applyWindowsIcon(context) {
  if (process.platform !== "win32") {
    return;
  }

  // If PORTABLE_MINIMAL=1 we still remove unsigned helper binaries (e.g.
  // elevate.exe) but skip any post-pack executable edits (rcedit).
  const portableMinimal = process.env.PORTABLE_MINIMAL === "1";
  // Remove optional elevation helper when present to minimize unsigned helper binaries.
  const elevateHelperPath = path.join(context.appOutDir, "resources", "elevate.exe");
  if (fs.existsSync(elevateHelperPath)) {
    try {
      fs.unlinkSync(elevateHelperPath);
    } catch (e) {
      // Non-fatal — log and continue.
      console.warn(`Failed to remove elevate helper: ${e.message}`);
    }
  }

  if (portableMinimal) {
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

  // Remove optional elevation helper when present to minimize unsigned helper binaries.
  const elevateHelperPath = path.join(context.appOutDir, "resources", "elevate.exe");
  if (fs.existsSync(elevateHelperPath)) {
    fs.unlinkSync(elevateHelperPath);
  }

  await rcedit(executablePath, {
    icon: iconPath,
    "requested-execution-level": "asInvoker"
  });
};