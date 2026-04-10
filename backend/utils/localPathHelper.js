const path = require("path");
const os = require("os");

function getSmartKhataFolder() {
  const homeDir = os.homedir();

  return path.join(homeDir, "Documents", "SmartKhata");
}

module.exports = {
  getSmartKhataFolder,
};
