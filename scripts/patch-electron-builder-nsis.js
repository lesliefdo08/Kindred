const fs = require('fs');
const path = require('path');

function patchNsisTarget() {
  let targetPath;
  try {
    targetPath = require.resolve('app-builder-lib/out/targets/nsis/NsisTarget.js');
  } catch (error) {
    console.error('Could not resolve app-builder-lib NsisTarget.js:', error.message);
    process.exitCode = 1;
    return;
  }

  const source = fs.readFileSync(targetPath, 'utf8');
  const oldBlock = `        else {
            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }`;
  const newBlock = `        else {
            try {
                await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
            }
            catch (error) {
                builder_util_1.log.warn(\`direct uninstaller extraction failed: \${error.message}; falling back to installer execution\`);
                await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            }
        }`;

  if (source.includes(newBlock)) {
    console.log('electron-builder NSIS uninstaller patch already applied.');
    return;
  }

  if (!source.includes(oldBlock)) {
    console.error('Could not find the expected NSIS uninstaller exec block in', targetPath);
    process.exitCode = 1;
    return;
  }

  const patched = source.replace(oldBlock, newBlock);
  fs.writeFileSync(targetPath, patched);
  console.log('Patched electron-builder NSIS uninstaller handling in', path.relative(process.cwd(), targetPath));
}

patchNsisTarget();
