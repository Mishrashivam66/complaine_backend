const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
{
  complaintId:{
    type:String,
    unique:true
  },

  title:{
    type:String,
    required:true
  },

  description:{
    type:String,
    required:true
  },

  category:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Category"
  },

  department:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Department"
  },

  priority:{
    type:String,
    enum:[
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL"
    ],
    default:"LOW"
  },

  status:{
    type:String,
    enum:[
      "OPEN",
      "IN_PROGRESS",
      "MATERIAL_REQUIRED",
      "COMPLETED",
      "REOPENED",
      "ESCALATED"
    ],
    default:"OPEN"
  },

  location:{
    campus:String,
    block:String,
    floor:String,
    room:String
  },

  createdBy:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User"
  },

  assignedWorker:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User"
  },

  assignedManager:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User"
  },

  isEscalated:{
    type:Boolean,
    default:false
  }

},
{
  timestamps:true
});

module.exports =
mongoose.model(
  "Complaint",
  complaintSchema
);