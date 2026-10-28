const express = require("express");
const multer = require("multer");

const { protect } = require("../../middleware/authMiddleware");
const roleMiddleware = require("../../middleware/roleMiddleware");

const {
  createManualInward,
  importExcel,
  getInwardHistory,
  getTransactions,
} = require("../../controllers/store/stockInwardController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, callback) => {
    const isExcel = /\.xlsx$/i.test(file.originalname);

    if (!isExcel) {
      return callback(new Error("Only .xlsx Excel files are allowed"));
    }

    callback(null, true);
  },
});

router.use(protect);
router.use(roleMiddleware("STORE_MANAGER"));

// Manual stock inward
router.post("/manual", createManualInward);

// Excel stock import
router.post(
  "/excel-import",
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      next();
    });
  },
  importExcel,
);

// Stock inward history
router.get("/history", getInwardHistory);

// Transaction ledger
router.get("/transactions", getTransactions);

module.exports = router;
