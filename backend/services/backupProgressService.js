const progressStore = new Map();
const cleanupTimers = new Map();

const COMPLETED_TTL = 10 * 1000;
const FAILED_TTL = 15 * 1000;
const MAX_RUNNING_AGE = 6 * 60 * 60 * 1000;

function getKey(userId) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  return userId.toString();
}

function clearCleanupTimer(key) {
  const timer = cleanupTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(key);
  }
}

function createOperationId(key, operation) {
  return `${operation}-${key}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

function isStale(data) {
  if (!data || data.status !== "running") {
    return false;
  }

  const startedAt = new Date(data.startedAt).getTime();

  if (!Number.isFinite(startedAt)) {
    return true;
  }

  return Date.now() - startedAt > MAX_RUNNING_AGE;
}

function initProgress(userId, operation = "backup") {
  const key = getKey(userId);
  const existing = progressStore.get(key);

  if (existing?.status === "running" && !isStale(existing)) {
    throw new Error(
      `Another ${existing.operation || "backup/restore"} operation is already running`,
    );
  }

  clearCleanupTimer(key);

  const operationId = createOperationId(key, operation);

  const now = new Date();

  progressStore.set(key, {
    operationId,
    progress: 0,
    status: "running",
    operation,
    message: "Starting...",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    failedAt: null,
  });

  return operationId;
}

function updateProgress(userId, progress, message = "") {
  const key = getKey(userId);
  const current = progressStore.get(key);

  if (!current || current.status !== "running") {
    return false;
  }

  const safeProgress = Math.min(
    99,
    Math.max(Number(current.progress || 0), Number(progress) || 0),
  );

  progressStore.set(key, {
    ...current,
    progress: safeProgress,
    message: message || current.message,
    updatedAt: new Date(),
  });

  return true;
}

function scheduleCleanup(key, operationId, delay) {
  clearCleanupTimer(key);

  const timer = setTimeout(() => {
    const current = progressStore.get(key);

    if (
      current &&
      current.operationId === operationId &&
      current.status !== "running"
    ) {
      progressStore.delete(key);
    }

    cleanupTimers.delete(key);
  }, delay);

  cleanupTimers.set(key, timer);
}

function completeProgress(userId, message = "Completed") {
  const key = getKey(userId);
  const current = progressStore.get(key);

  if (!current) {
    return false;
  }

  const now = new Date();

  progressStore.set(key, {
    ...current,
    progress: 100,
    status: "completed",
    message,
    updatedAt: now,
    completedAt: now,
  });

  scheduleCleanup(key, current.operationId, COMPLETED_TTL);

  return true;
}

function failProgress(userId, message = "Failed") {
  const key = getKey(userId);
  const current = progressStore.get(key);

  if (!current) {
    return false;
  }

  const now = new Date();

  progressStore.set(key, {
    ...current,
    status: "failed",
    message,
    updatedAt: now,
    failedAt: now,
  });

  scheduleCleanup(key, current.operationId, FAILED_TTL);

  return true;
}

function getProgress(userId) {
  const key = getKey(userId);
  const current = progressStore.get(key);

  if (current?.status === "running" && isStale(current)) {
    clearCleanupTimer(key);
    progressStore.delete(key);

    return {
      progress: 0,
      status: "idle",
      operation: null,
      operationId: null,
      message: "",
    };
  }

  return (
    current || {
      progress: 0,
      status: "idle",
      operation: null,
      operationId: null,
      message: "",
    }
  );
}

function isRunning(userId) {
  const key = getKey(userId);
  const current = progressStore.get(key);

  if (!current) {
    return false;
  }

  if (isStale(current)) {
    clearCleanupTimer(key);
    progressStore.delete(key);
    return false;
  }

  return current.status === "running";
}

function clearProgress(userId) {
  const key = getKey(userId);

  clearCleanupTimer(key);
  progressStore.delete(key);
}

module.exports = {
  initProgress,
  updateProgress,
  completeProgress,
  failProgress,
  getProgress,
  isRunning,
  clearProgress,
};
