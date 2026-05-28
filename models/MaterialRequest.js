const mongoose = require("mongoose");

const materialRequestSchema = new mongoose.Schema(
    {
        requestId: {
            type: String,
            unique: true,
            required: true,
        },

        jobCard: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "JobCard",
            required: true,
        },

        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        itemName: {
            type: String,
            required: true,
            trim: true,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
        },

        reason: {
            type: String,
            required: true,
        },

        status: {
            type: String,
            enum: [
                "PENDING",
                "APPROVED_BY_STORE",
                "REJECTED",
                "ISSUED",
                "OUT_OF_STOCK"
            ],
            default: "PENDING",
        },

        approvedByStore: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        issuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "MaterialRequest",
    materialRequestSchema
);