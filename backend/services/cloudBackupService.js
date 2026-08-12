const fs = require("fs");
const path = require("path");

const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");

const { uploadFileToR2 } = require("./s3Service");
const { deleteOldCloudBackups } = require("./cloudListService");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

function validateR2Config() {
  const required = [
    "R2_ENDPOINT",
    "R2_ACCESS_KEY",
    "R2_SECRET_KEY",
    "R2_BUCKET",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing R2 configuration: ${missing.join(", ")}`);
  }
}

async function verifyCloudBackup(key, expectedSize) {
  const command = new HeadObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });

  const response = await s3.send(command);

  const cloudSize = Number(response.ContentLength || 0);

  if (cloudSize <= 0) {
    throw new Error("Uploaded cloud backup is empty");
  }

  if (Number(expectedSize) > 0 && cloudSize !== Number(expectedSize)) {
    throw new Error(
      `Cloud backup size verification failed. Local: ${expectedSize} bytes, Cloud: ${cloudSize} bytes`,
    );
  }

  return {
    key,
    size: cloudSize,
    verified: true,
  };
}

async function uploadToCloud(filePath, userId) {
  try {
    validateR2Config();

    if (!userId) {
      throw new Error("User ID is required");
    }

    if (!filePath || typeof filePath !== "string") {
      throw new Error("Backup file path is required");
    }

    if (!fs.existsSync(filePath)) {
      throw new Error("Backup file does not exist");
    }

    const stats = fs.statSync(filePath);

    if (!stats.isFile()) {
      throw new Error("Backup path is not a file");
    }

    if (stats.size <= 0) {
      throw new Error("Backup file is empty");
    }

    const fileName = path.basename(filePath);

    if (!fileName.toLowerCase().endsWith(".zip")) {
      throw new Error("Backup file must be a ZIP file");
    }

    const expectedPrefix = `smartkhata-backup-${userId}-`;

    if (!fileName.startsWith(expectedPrefix)) {
      throw new Error("Invalid SmartKhata backup file name");
    }

    console.log("☁️ Uploading backup to R2:", fileName);

    const fileBuffer = fs.readFileSync(filePath);

    if (fileBuffer.length !== stats.size) {
      throw new Error("Backup file could not be read completely");
    }

    const key = await uploadFileToR2(fileBuffer, fileName, userId);

    if (!key) {
      throw new Error("R2 upload did not return an object key");
    }

    const verification = await verifyCloudBackup(key, stats.size);

    console.log("✅ Cloud backup uploaded and verified:", verification.key);

    // Cleanup failure must not invalidate a good backup
    try {
      const cleanupResult = await deleteOldCloudBackups(userId, 5);

      if (cleanupResult?.success === false) {
        console.error(
          "⚠️ Cloud backup retention cleanup incomplete:",
          cleanupResult.message,
        );
      }
    } catch (cleanupError) {
      console.error("⚠️ Cloud retention cleanup failed:", cleanupError.message);
    }

    return {
      success: true,
      key: verification.key,
      size: verification.size,
      verified: true,
    };
  } catch (error) {
    console.error("❌ R2 backup upload failed:", error.message);

    // ضروری: error اوپر backupService تک جائے
    throw new Error(`Cloud backup failed: ${error.message}`);
  }
}

module.exports = {
  uploadToCloud,
};
