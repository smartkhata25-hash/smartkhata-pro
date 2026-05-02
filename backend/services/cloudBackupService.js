const path = require("path");
const { uploadFileToR2 } = require("./s3Service");
const { deleteOldCloudBackups } = require("./cloudListService");

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
    const fileBuffer = fs.readFileSync(filePath);

    await uploadFileToR2(fileBuffer, fileName);

    console.log("✅ Backup uploaded to R2");
    await deleteOldCloudBackups(5);

    lastUploadedFile = filePath;
  } catch (error) {
    console.error("❌ R2 Upload Error:", error.message);
  }
}

module.exports = {
  uploadToCloud,
};
