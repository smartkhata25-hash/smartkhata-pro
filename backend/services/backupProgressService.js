// Backup Progress Service (PRO VERSION)

const progressStore = new Map();

function initProgress(userId, operation = "backup") {
  progressStore.set(userId.toString(), {
    progress: 0,
    status: "running",
    operation,
    message: "Starting...",
    startedAt: new Date(),
    updatedAt: new Date(),
  });
}

// UPDATE PROGRESS

function updateProgress(userId, progress, message = "") {
  const key = userId.toString();

  if (!progressStore.has(key)) return;

  const current = progressStore.get(key);

  progressStore.set(key, {
    ...current,
    progress: Math.min(100, Math.max(0, progress)),
    message: message || current.message,
    updatedAt: new Date(),
  });
}

// COMPLETE PROGRESS

function completeProgress(userId, message = "Completed") {
  const key = userId.toString();

  if (!progressStore.has(key)) return;

  const current = progressStore.get(key);

  progressStore.set(key, {
    ...current,
    progress: 100,
    status: "completed",
    message,
    updatedAt: new Date(),
  });

  setTimeout(() => {
    progressStore.delete(key);
  }, 10000);
}

// FAIL PROGRESS

function failProgress(userId, message = "Failed") {
  const key = userId.toString();

  if (!progressStore.has(key)) return;

  const current = progressStore.get(key);

  progressStore.set(key, {
    ...current,
    status: "failed",
    message,
    updatedAt: new Date(),
  });

  setTimeout(() => {
    progressStore.delete(key);
  }, 15000);
}

// GET PROGRESS

function getProgress(userId) {
  const key = userId.toString();

  return (
    progressStore.get(key) || {
      progress: 0,
      status: "idle",
      operation: null,
      message: "",
    }
  );
}

// CHECK IF RUNNING

function isRunning(userId) {
  const key = userId.toString();

  const data = progressStore.get(key);

  return data?.status === "running";
}

// CLEAR (manual)

function clearProgress(userId) {
  progressStore.delete(userId.toString());
}

// EXPORTS

module.exports = {
  initProgress,
  updateProgress,
  completeProgress,
  failProgress,
  getProgress,
  isRunning,
  clearProgress,
};
