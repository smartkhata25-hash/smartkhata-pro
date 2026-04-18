const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

async function getCloudBackupList() {
  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
    });

    const response = await s3.send(command);

    const files =
      response.Contents?.map((item) => ({
        name: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
      }))
        .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
        .slice(0, 5) || [];

    return {
      success: true,
      files,
    };
  } catch (error) {
    console.error("❌ Cloud list error:", error.message);

    return {
      success: false,
      message: error.message,
    };
  }
}

async function downloadBackupFromCloud(fileName) {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
    });

    const response = await s3.send(command);

    const filePath = path.join("/tmp", fileName); // render کیلئے

    const writeStream = fs.createWriteStream(filePath);

    await new Promise((resolve, reject) => {
      const chunks = [];

for await (const chunk of response.Body) {
  chunks.push(chunk);
}

const buffer = Buffer.concat(chunks);

fs.writeFileSync(filePath, buffer);
    });

    return {
      success: true,
      path: filePath,
    };
  } catch (error) {
    console.error("❌ Download error:", error.message);

    return {
      success: false,
      message: error.message,
    };
  }
}

module.exports = {
  getCloudBackupList,
  downloadBackupFromCloud,
};
