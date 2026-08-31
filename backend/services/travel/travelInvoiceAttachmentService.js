const { deleteFile, getFileUrl, uploadFile } = require("../r2FileService");

const MAX_TRAVEL_INVOICE_ATTACHMENTS = 3;

const normalizeAttachment = (attachment = {}) => ({
  key: attachment.key || "",
  type: attachment.type || "",
  size: Number(attachment.size || 0),
  originalName: attachment.originalName || "",
});

const formatTravelInvoiceAttachments = (booking = {}) => {
  if (Array.isArray(booking.attachments) && booking.attachments.length > 0) {
    return booking.attachments.map((attachment) => {
      const plain = attachment?.toObject ? attachment.toObject() : attachment;

      return {
        ...normalizeAttachment(plain),
        fullUrl: getFileUrl(plain.key),
      };
    });
  }

  if (booking.attachmentUrl) {
    return [
      {
        key: booking.attachmentUrl,
        type: booking.attachmentType || "",
        size: Number(booking.attachmentSize || 0),
        originalName: booking.attachmentOriginalName || "",
        fullUrl: getFileUrl(booking.attachmentUrl),
      },
    ];
  }

  return [];
};

const uploadTravelInvoiceFiles = async (
  files,
  userId,
  moduleName = "travel-invoices",
) => {
  const uploaded = [];

  if (!files || files.length === 0) {
    return uploaded;
  }

  if (files.length > MAX_TRAVEL_INVOICE_ATTACHMENTS) {
    throw new Error("Maximum 3 attachments allowed");
  }

  for (const file of files) {
    const saved = await uploadFile({
      buffer: file.buffer,
      userId,
      moduleName,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    uploaded.push({
      key: saved.key,
      type: saved.mimeType,
      size: saved.size,
      originalName: saved.originalName,
    });
  }

  return uploaded;
};

const parseKeepAttachmentKeys = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch (error) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const mergeTravelInvoiceAttachments = ({
  existingAttachments = [],
  uploadedAttachments = [],
  keepAttachmentKeys = null,
}) => {
  const existing = existingAttachments.map(normalizeAttachment);
  const keepKeys = keepAttachmentKeys ? parseKeepAttachmentKeys(keepAttachmentKeys) : null;
  const kept = keepKeys
    ? existing.filter((attachment) => keepKeys.includes(attachment.key))
    : existing;
  const nextAttachments = [...kept, ...uploadedAttachments.map(normalizeAttachment)];

  if (nextAttachments.length > MAX_TRAVEL_INVOICE_ATTACHMENTS) {
    throw new Error("Maximum 3 attachments allowed");
  }

  const removed = existing.filter(
    (attachment) =>
      attachment.key &&
      !nextAttachments.some((nextAttachment) => nextAttachment.key === attachment.key),
  );

  return {
    attachments: nextAttachments,
    removed,
  };
};

const cleanupTravelInvoiceAttachments = async (attachments = []) => {
  for (const attachment of attachments) {
    if (!attachment?.key || !attachment.key.startsWith("users/")) {
      continue;
    }

    try {
      await deleteFile(attachment.key);
    } catch (error) {
      console.error("Travel attachment cleanup failed:", error.message);
    }
  }
};

const applyPrimaryAttachmentFields = (booking, attachments = []) => {
  const primary = attachments[0] || null;

  booking.attachments = attachments.map(normalizeAttachment);
  booking.attachmentUrl = primary?.key || "";
  booking.attachmentType = primary?.type || "";
  booking.attachmentSize = primary?.size || 0;
  booking.attachmentOriginalName = primary?.originalName || "";
};

module.exports = {
  MAX_TRAVEL_INVOICE_ATTACHMENTS,
  applyPrimaryAttachmentFields,
  cleanupTravelInvoiceAttachments,
  formatTravelInvoiceAttachments,
  mergeTravelInvoiceAttachments,
  uploadTravelInvoiceFiles,
};
