const fs = require("fs");
const path = require("path");

exports.default = async function (context) {
  if (context.electronPlatformName !== "linux") return;

  const appOutDir = context.appOutDir;
  const binName = "splayer";
  const binPath = path.join(appOutDir, binName);
  const realBinPath = path.join(appOutDir, binName + ".bin");

  if (fs.existsSync(binPath) && !fs.existsSync(realBinPath)) {
    fs.renameSync(binPath, realBinPath);
    const wrapper =
      '#!/bin/bash\n' +
      'HERE="$(dirname "$(readlink -f "$0")")"\n' +
      'exec "$HERE/' + binName + '.bin" --no-sandbox "$@"\n';
    fs.writeFileSync(binPath, wrapper);
    fs.chmodSync(binPath, 0o755);
  }

  const sandboxPath = path.join(appOutDir, "chrome-sandbox");
  if (fs.existsSync(sandboxPath)) {
    fs.unlinkSync(sandboxPath);
  }
};
