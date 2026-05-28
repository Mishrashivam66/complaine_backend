const mongoose = require("mongoose");

const prioritySchema =
new mongoose.Schema({

  name:{
    type:String,
    enum:[
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL"
    ]
  },

  slaHours:Number,

  color:String

});

module.exports =
mongoose.model(
  "Priority",
  prioritySchema
);