const multer = require("multer");

// ==========================================
// STORAGE
// ==========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(
      null,

      "uploads/",
    );
  },

  filename: (req, file, cb) => {
    cb(
      null,

      Date.now() + "-" + file.originalname,
    );
  },
});

// ==========================================
// FILE FILTER
// ==========================================

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/vnd.ms-excel",

    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Only Excel files are allowed"),

      false,
    );
  }
};

// ==========================================
// MULTER
// ==========================================

const upload = multer({
  storage,

  fileFilter,
});

// ==========================================
// EXPORT
// ==========================================

module.exports = upload;
