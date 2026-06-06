const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const path = require("path");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

/* =====================================================
   BUILD FILE KEY
===================================================== */

function buildFileKey({ userId, moduleName, originalName }) {
  const ext = path.extname(originalName || "");

  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;

  return `users/${userId}/${moduleName}/${fileName}`;
}

/* =====================================================
   UPLOAD FILE
===================================================== */

async function uploadFile({
  buffer,
  userId,
  moduleName,
  originalName,
  mimeType,
}) {
  const key = buildFileKey({
    userId,
    moduleName,
    originalName,
  });

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType || "application/octet-stream",
  });

  await s3.send(command);

  return {
    key,
    size: buffer.length,
    originalName,
    mimeType,
  };
}

/* =====================================================
   DELETE FILE
===================================================== */

async function deleteFile(key) {
  if (!key) return;

  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });

  await s3.send(command);
}

/* =====================================================
   FILE EXISTS
===================================================== */

async function fileExists(key) {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }),
    );

    return true;
  } catch (error) {
    return false;
  }
}

/* =====================================================
   PUBLIC URL
===================================================== */

function getFileUrl(key) {
  if (!key) return "";

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  uploadFile,
  deleteFile,
  fileExists,
  getFileUrl,
};
