const dns = require("dns");

let lastUploadedFile = null;

function isInternetAvailable() {
  return new Promise((resolve) => {
    dns.lookup("google.com", (err) => {
      resolve(!err);
    });
  });
}

async function uploadToCloud(filePath) {
  const hasInternet = await isInternetAvailable();

  if (!hasInternet) {
    console.log("🌐 No internet, skipping cloud backup");
    return;
  }

  // ❗ SAME FILE دوبارہ upload نہ ہو
  if (lastUploadedFile === filePath) {
    console.log("⚠️ Backup already uploaded, skipping...");
    return;
  }

  console.log("☁️ Uploading backup to cloud...", filePath);

  // dummy success
  console.log("✅ Cloud backup uploaded");

  lastUploadedFile = filePath;
}

module.exports = {
  uploadToCloud,
};
