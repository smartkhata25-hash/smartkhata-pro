const path = require("path");
const { uploadFileToR2 } = require("./s3Service");

let lastUploadedFile = null;

async function uploadToCloud(filePath) {
  try {
    if (lastUploadedFile === filePath) {
      console.log("⚠️ Backup already uploaded, skipping...");
      return;
    }

    const fileName = path.basename(filePath);

    console.log("☁️ Uploading backup to R2...", fileName);

    const fs = require("fs"); // ✅ ADD
    const fileBuffer = fs.readFileSync(filePath); // ✅ ADD

    await uploadFileToR2(fileBuffer, fileName); // ✅ FIX

    console.log("✅ Backup uploaded to R2");

    lastUploadedFile = filePath;
  } catch (error) {
    console.error("❌ R2 Upload Error:", error.message);
  }
}

module.exports = {
  uploadToCloud,
};
