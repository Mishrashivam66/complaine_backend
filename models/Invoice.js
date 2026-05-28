const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
{
  invoiceId: {
    type: String,
    unique: true,
    required: true
  },

  materialRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MaterialRequest",
    required: true
  },

  itemName: String,

  quantity: Number,

  unitPrice: Number,

  totalAmount: Number,

  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  status: {
    type: String,
    enum: ["GENERATED", "PAID"],
    default: "GENERATED"
  }

},
{
  timestamps: true
});

module.exports =
mongoose.model(
  "Invoice",
  invoiceSchema
);