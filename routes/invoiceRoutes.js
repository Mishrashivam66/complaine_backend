const express = require("express");

const {
  createInvoice,
  getInvoices
} = require("../controllers/invoiceController");

const router = express.Router();

router.post(
  "/",
  createInvoice
);

router.get(
  "/",
  getInvoices
);

module.exports = router;