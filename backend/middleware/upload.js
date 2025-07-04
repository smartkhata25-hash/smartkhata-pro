// backend/middleware/upload.js
const multer = require('multer');

/*
  Memory-storage کافی ہے کیونکہ CSV / Excel فائل
  صرف پڑھنی ہے، ڈسک پر save نہیں کرنی۔
*/
module.exports = multer({ storage: multer.memoryStorage() });
