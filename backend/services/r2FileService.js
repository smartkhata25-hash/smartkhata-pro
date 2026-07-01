const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const path = require("path");
const sharp = require("sharp");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// BUILD FILE KEY

function buildFileKey({ userId, moduleName, originalName, mimeType }) {
  const isImage = mimeType?.startsWith("image/");
  const ext = isImage ? ".webp" : path.extname(originalName || "");

  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;

  return `users/${userId}/${moduleName}/${fileName}`;
}

// UPLOAD FILE

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
    mimeType,
  });

  let finalBuffer = buffer;
  let finalMimeType = mimeType || "application/octet-stream";

  if (mimeType?.startsWith("image/")) {
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error("Image size must be 5MB or less");
    }

    finalBuffer = await sharp(buffer)
      .rotate()
      .resize({
        width: 1600,
        withoutEnlargement: true,
      })
      .webp({
        quality: 75,
      })
      .toBuffer();

    finalMimeType = "image/webp";
  }

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: finalBuffer,
    ContentType: finalMimeType,
  });

  await s3.send(command);

  return {
    key,
    size: finalBuffer.length,
    originalName,
    mimeType: finalMimeType,
  };
}

// DELETE FILE

async function deleteFile(key) {
  if (!key) return;

  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });

  await s3.send(command);
}

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

function getFileUrl(key) {
  if (!key) return "";

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// EXPORTS

module.exports = {
  uploadFile,
  deleteFile,
  fileExists,
  getFileUrl,
};
