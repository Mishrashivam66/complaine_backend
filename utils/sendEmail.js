const nodemailer = require("nodemailer");

// ==========================================
// CREATE TRANSPORTER
// ==========================================

const transporter = nodemailer.createTransport({
  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,

    pass: process.env.EMAIL_PASS,
  },
});

// ==========================================
// SEND EMAIL FUNCTION
// ==========================================

const sendEmail = async (
  to,

  subject,

  html,
) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,

      to,

      subject,

      html,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(
      "Email Sent:",

      info.response,
    );
  } catch (error) {
    console.log("FULL EMAIL ERROR:");

    console.log(error);

    console.log("ERROR MESSAGE:");

    console.log(error.message);

    throw error;
  }
};

// ==========================================
// EXPORT FUNCTION
// ==========================================

module.exports = sendEmail;
