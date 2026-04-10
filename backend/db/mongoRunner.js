const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let mongoProcess = null;

const startMongo = () => {
  return new Promise((resolve, reject) => {
    try {
      const dbPath = path.join(__dirname, "data");

      // 📁 create db folder
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }

      let mongodPath;

      // ✅ DEV MODE (npm run electron)
      if (process.env.NODE_ENV !== "production") {
        mongodPath = "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe";
        console.log("🧪 Using SYSTEM MongoDB");
      }
      // ✅ PRODUCTION (EXE build)
      else {
        mongodPath = path.join(process.resourcesPath, "mongodb", "mongod.exe");
        console.log("📦 Using BUILT-IN MongoDB");
      }

      console.log("Mongo Path:", mongodPath);
      console.log("DB Path:", dbPath);

      mongoProcess = spawn(mongodPath, ["--dbpath", dbPath]);

      mongoProcess.stdout.on("data", (data) => {
        const msg = data.toString();
        console.log("Mongo:", msg);

        if (msg.toLowerCase().includes("waiting for connections")) {
          console.log("✅ MongoDB started");
          resolve();
        }
      });

      mongoProcess.stderr.on("data", (data) => {
        console.error("❌ MongoDB Error:", data.toString());
      });

      mongoProcess.on("error", (err) => {
        console.error("❌ MongoDB Spawn Error:", err);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { startMongo };
