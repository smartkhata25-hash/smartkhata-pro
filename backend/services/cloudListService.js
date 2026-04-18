const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

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

module.exports = {
  getCloudBackupList,
};
