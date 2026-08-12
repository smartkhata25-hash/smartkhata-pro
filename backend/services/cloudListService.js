const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream/promises");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const BACKUP_FILE_PREFIX = "smartkhata-backup-";
const BACKUP_EXTENSION = ".zip";

function getBackupPrefix(userId) {
  return `users/${userId}/backups/`;
}

function getLegacyUserPrefix(userId) {
  return `users/${userId}/`;
}

function isValidBackupFileName(fileName, userId) {
  if (!fileName || typeof fileName !== "string") {
    return false;
  }

  const cleanName = path.basename(fileName);

  if (cleanName !== fileName) {
    return false;
  }

  if (!cleanName.endsWith(BACKUP_EXTENSION)) {
    return false;
  }

  const expectedPrefix = `${BACKUP_FILE_PREFIX}${userId}-`;

  return cleanName.startsWith(expectedPrefix);
}

async function listAllObjects(prefix) {
  const objects = [];

  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await s3.send(command);

    if (Array.isArray(response.Contents)) {
      objects.push(...response.Contents);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

function normalizeBackupObject(item, userId, source) {
  if (!item?.Key) {
    return null;
  }

  const fileName = path.basename(item.Key);

  if (!isValidBackupFileName(fileName, userId)) {
    return null;
  }

  if (source === "legacy") {
    const expectedKey = `${getLegacyUserPrefix(userId)}${fileName}`;

    if (item.Key !== expectedKey) {
      return null;
    }
  }

  if (source === "new") {
    const expectedKey = `${getBackupPrefix(userId)}${fileName}`;

    if (item.Key !== expectedKey) {
      return null;
    }
  }

  return {
    key: item.Key,
    name: fileName,
    size: Number(item.Size || 0),
    lastModified: item.LastModified || null,
    source,
  };
}

async function getAllValidCloudBackups(userId) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  const [newObjects, legacyObjects] = await Promise.all([
    listAllObjects(getBackupPrefix(userId)),
    listAllObjects(getLegacyUserPrefix(userId)),
  ]);

  const backupMap = new Map();

  for (const item of legacyObjects) {
    const backup = normalizeBackupObject(item, userId, "legacy");

    if (!backup) {
      continue;
    }

    backupMap.set(backup.name, backup);
  }

  for (const item of newObjects) {
    const backup = normalizeBackupObject(item, userId, "new");

    if (!backup) {
      continue;
    }

    backupMap.set(backup.name, backup);
  }

  return [...backupMap.values()].sort(
    (a, b) =>
      new Date(b.lastModified || 0).getTime() -
      new Date(a.lastModified || 0).getTime(),
  );
}

async function getCloudBackupList(userId, limit = 5) {
  try {
    if (!userId) {
      return {
        success: false,
        files: [],
        message: "User ID is required",
      };
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 100);

    const backups = await getAllValidCloudBackups(userId);

    const files = backups.slice(0, safeLimit).map((backup) => ({
      name: backup.name,
      size: backup.size,
      lastModified: backup.lastModified,

      storage: backup.source === "new" ? "backups" : "legacy",
    }));

    return {
      success: true,
      files,
    };
  } catch (error) {
    console.error("❌ Cloud backup list error:", error.message);

    return {
      success: false,
      files: [],
      message: error.message || "Failed to fetch cloud backups",
    };
  }
}

async function deleteOldCloudBackups(userId, limit = 5) {
  try {
    if (!userId) {
      return {
        success: false,
        deleted: 0,
        message: "User ID is required",
      };
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 100);

    const backups = await getAllValidCloudBackups(userId);

    if (backups.length <= safeLimit) {
      return {
        success: true,
        deleted: 0,
        message: "No old cloud backups to delete",
      };
    }

    const filesToDelete = backups.slice(safeLimit);

    let deleted = 0;
    const failed = [];

    for (const backup of filesToDelete) {
      try {
        const validNewKey =
          backup.key === `${getBackupPrefix(userId)}${backup.name}`;

        const validLegacyKey =
          backup.key === `${getLegacyUserPrefix(userId)}${backup.name}`;

        if (!validNewKey && !validLegacyKey) {
          console.error("⚠️ Unsafe cloud delete prevented:", backup.key);

          failed.push({
            name: backup.name,
            reason: "Unsafe backup key",
          });

          continue;
        }

        if (!isValidBackupFileName(backup.name, userId)) {
          console.error(
            "⚠️ Invalid backup filename delete prevented:",
            backup.name,
          );

          failed.push({
            name: backup.name,
            reason: "Invalid backup filename",
          });

          continue;
        }

        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: backup.key,
        });

        await s3.send(deleteCommand);

        deleted += 1;

        console.log("🗑️ Deleted old cloud backup:", backup.key);
      } catch (deleteError) {
        console.error(
          "❌ Failed to delete old cloud backup:",
          backup.key,
          deleteError.message,
        );

        failed.push({
          name: backup.name,
          reason: deleteError.message,
        });
      }
    }

    return {
      success: failed.length === 0,
      deleted,
      failed,
      message:
        failed.length === 0
          ? "Old cloud backups cleaned successfully"
          : "Some old cloud backups could not be deleted",
    };
  } catch (error) {
    console.error("❌ Cloud backup cleanup error:", error.message);

    return {
      success: false,
      deleted: 0,
      message: error.message || "Cloud backup cleanup failed",
    };
  }
}

async function findCloudBackup(userId, fileName) {
  if (!isValidBackupFileName(fileName, userId)) {
    throw new Error("Invalid backup file name");
  }

  const backups = await getAllValidCloudBackups(userId);

  const backup = backups.find((item) => item.name === fileName);

  if (!backup) {
    throw new Error("Cloud backup not found");
  }

  return backup;
}

async function downloadBackupFromCloud(userId, fileName) {
  let filePath = null;

  try {
    if (!userId) {
      return {
        success: false,
        message: "User ID is required",
      };
    }

    if (!fileName) {
      return {
        success: false,
        message: "Backup filename is required",
      };
    }

    if (!isValidBackupFileName(fileName, userId)) {
      return {
        success: false,
        message: "Invalid backup filename",
      };
    }

    const backup = await findCloudBackup(userId, fileName);

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: backup.key,
    });

    const response = await s3.send(command);

    if (!response.Body) {
      throw new Error("Cloud backup download returned an empty response");
    }

    const tempFileName = [
      "smartkhata-download",
      userId,
      Date.now(),
      Math.random().toString(36).substring(2, 8),
      fileName,
    ].join("-");

    filePath = path.join(os.tmpdir(), tempFileName);

    const writeStream = fs.createWriteStream(filePath, {
      flags: "wx",
    });

    await pipeline(response.Body, writeStream);

    if (!fs.existsSync(filePath)) {
      throw new Error("Downloaded backup file was not created");
    }

    const stats = fs.statSync(filePath);

    if (!stats.isFile() || stats.size <= 0) {
      throw new Error("Downloaded backup file is empty");
    }

    if (
      Number.isFinite(Number(response.ContentLength)) &&
      Number(response.ContentLength) > 0 &&
      stats.size !== Number(response.ContentLength)
    ) {
      throw new Error(
        `Downloaded backup size mismatch. Expected ${response.ContentLength} bytes but received ${stats.size} bytes`,
      );
    }

    if (Number(backup.size || 0) > 0 && stats.size !== Number(backup.size)) {
      throw new Error(
        `Cloud backup size verification failed. Expected ${backup.size} bytes but received ${stats.size} bytes`,
      );
    }

    return {
      success: true,
      path: filePath,
      name: backup.name,
      size: stats.size,
      source: backup.source,
    };
  } catch (error) {
    console.error("❌ Cloud backup download error:", error.message);

    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupError) {
      console.error("❌ Partial backup cleanup error:", cleanupError.message);
    }

    return {
      success: false,
      message: error.message || "Backup download failed",
    };
  }
}

module.exports = {
  getCloudBackupList,
  downloadBackupFromCloud,
  deleteOldCloudBackups,

  getBackupPrefix,
  isValidBackupFileName,
};
