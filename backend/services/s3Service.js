const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const uploadFileToR2 = async (fileBuffer, fileName, userId) => {
  const key = `users/${userId}/${fileName}`;

  const params = {
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: fileBuffer,
  };

  const command = new PutObjectCommand(params);

  await s3.send(command);

  return key;
};

module.exports = { uploadFileToR2 };
