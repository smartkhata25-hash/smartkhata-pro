const path = require("path");
const { uploadFileToR2 } = require("./s3Service");

let lastUploadedFile = null;

async function uploadToCloud(filePath) {
  try {
    // ❗ duplicate upload نہ ہو
    if (lastUploadedFile === filePath) {
      console.log("⚠️ Backup already uploaded, skipping...");
      return;
    }

    const fileName = path.basename(filePath);

    console.log("☁️ Uploading backup to R2...", fileName);

    await uploadFileToR2(filePath, fileName);

    console.log("✅ Backup uploaded to R2");

    lastUploadedFile = filePath;
  } catch (error) {
    console.error("❌ R2 Upload Error:", error.message);
  }
}

module.exports = {
  uploadToCloud,
};
