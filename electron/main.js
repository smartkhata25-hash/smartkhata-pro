const { app, BrowserWindow } = require("electron");
const path = require("path");

let mainWindow;

// ✅ Backend start (safe + logs)
function startBackend() {
  try {
    const serverPath = path.join(__dirname, "..", "backend", "startServer.js");

    console.log("🚀 Starting backend...");
    console.log("Path:", serverPath);

    require(serverPath);

    console.log("✅ Backend started successfully");
  } catch (err) {
    console.error("❌ Backend start error:", err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexPath = path.join(__dirname, "../frontend/build/index.html");

  console.log("📂 Loading frontend from:", indexPath);

  mainWindow.loadFile(indexPath);

  // ✅ DevTools auto open (testing کیلئے)
  mainWindow.webContents.openDevTools();
}

// ✅ App ready
app.whenReady().then(() => {
  startBackend();

  // ⏳ تھوڑا delay تاکہ backend ready ہو جائے
  setTimeout(() => {
    createWindow();
  }, 8000); // پہلے 4000 تھا → safe side 6000
});

// ❌ Proper exit handling
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
