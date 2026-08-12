const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const validateR2Config = () => {
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
};

const sanitizeFileName = (fileName) => {
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Valid file name is required");
  }

  const cleanName = fileName.replace(/\\/g, "/").split("/").pop().trim();

  if (!cleanName || cleanName === "." || cleanName === "..") {
    throw new Error("Invalid file name");
  }

  return cleanName;
};

const uploadFileToR2 = async (fileBuffer, fileName, userId) => {
  validateR2Config();

  if (!userId) {
    throw new Error("User ID is required");
  }

  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new Error("Backup file buffer is empty or invalid");
  }

  const cleanFileName = sanitizeFileName(fileName);

  if (!cleanFileName.toLowerCase().endsWith(".zip")) {
    throw new Error("Only ZIP backup files can be uploaded");
  }

  const expectedPrefix = `smartkhata-backup-${userId}-`;

  if (!cleanFileName.startsWith(expectedPrefix)) {
    throw new Error("Invalid backup file name");
  }

  const key = `users/${userId}/backups/${cleanFileName}`;

  const params = {
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: "application/zip",
    ContentLength: fileBuffer.length,
    Metadata: {
      userid: String(userId),
      backuptype: "smartkhata",
    },
  };

  try {
    const command = new PutObjectCommand(params);

    const response = await s3.send(command);

    if (!response) {
      throw new Error("R2 returned an empty upload response");
    }

    return key;
  } catch (error) {
    console.error("❌ R2 backup upload failed:", error.message);

    throw new Error(`Cloud backup upload failed: ${error.message}`);
  }
};

module.exports = {
  uploadFileToR2,
};
