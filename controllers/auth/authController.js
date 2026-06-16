const User = require("../../models/User");

const AuditLog = require("../../models/AuditLog");

const generateToken = require("../../utils/generateToken");
const crypto = require("crypto");
const sendEmail = require("../../utils/sendEmail");
// ==========================================
// REGISTER USER
// ==========================================

const registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      phone,
      hostel,
      floor,
      pocket,
      roomNumber,
      isHosteller,
    } = req.body;

    // ==========================================
    // CHECK EXISTING USER
    // ==========================================

    const userExists = await User.findOne({
      email,
    });

    if (userExists) {
      return res.status(400).json({
        success: false,

        message: "User already exists",
      });
    }

    // ==========================================
    // BOOLEAN CONVERSION
    // ==========================================

    const hostellerValue = isHosteller === true || isHosteller === "true";

    // ==========================================
    // CREATE USER
    // ==========================================

    let hostelCode = hostel;

    if (hostel === "Boys Hostel H1") {
      hostelCode = "H1";
    }

    if (hostel === "Boys Hostel H4") {
      hostelCode = "H4";
    }

    if (hostel === "Girls Hostel H2") {
      hostelCode = "H2";
    }

    if (hostel === "Girls Hostel H3") {
      hostelCode = "H3";
    }

    if (hostel === "Faculty Hostel H5") {
      hostelCode = "H5";
    }

    const user = await User.create({
      name,

      email,

      password,

      role,

      phone,

      // HOSTEL DETAILS

      hostel: hostelCode,

      floor,

      pocket,

      roomNumber,

      // HOSTELLER

      isHosteller: hostellerValue,

      // ==========================================
      // APPROVAL SYSTEM
      // ==========================================

      permissionPending: role === "STUDENT" && hostellerValue,

      isApproved: role === "STUDENT" && hostellerValue ? false : true,
    });

    // ==========================================
    // GENERATE TOKEN
    // ==========================================

    const verificationToken = user.generateVerificationToken();

    console.log("RAW TOKEN:", verificationToken);
    console.log("HASH TOKEN:", user.verificationToken);
    console.log("EXPIRE:", user.verificationTokenExpire);

    await user.save();
    const savedUser = await User.findById(user._id);

    console.log("AFTER SAVE TOKEN:", savedUser.verificationToken);
    console.log("AFTER SAVE EXPIRE:", savedUser.verificationTokenExpire);

    const verifyURL = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;

    const message = `
<h2>Campus Nexus ERP</h2>

<p>Welcome to Campus Nexus ERP.</p>

<p>Please verify your account by clicking below.</p>

<a href="${verifyURL}">
Verify Email
</a>

<p>This link expires in 15 minutes.</p>
`;

    await sendEmail(user.email, "Verify Your Campus Nexus Account", message);

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(201).json({
      success: true,
      message: "Registration successful. Verification email sent.",
    });
  } catch (error) {
    console.log("REGISTER ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// LOGIN USER
// ==========================================

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ==========================================
    // CHECK USER
    // ==========================================

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // CHECK PASSWORD
    // ==========================================

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,

        message: "Invalid email or password",
      });
    }
    // ==========================================
    // EMAIL VERIFICATION CHECK
    // ==========================================

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email first",
      });
    }

    // ==========================================
    // ACCOUNT STATUS CHECK
    // ==========================================

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account disabled",
      });
    }

    // ==========================================
    // HOSTELLER APPROVAL CHECK
    // ==========================================

    if (
      user.role === "STUDENT" &&
      user.isHosteller &&
      (user.permissionPending === true || user.isApproved === false)
    ) {
      return res.status(403).json({
        success: false,

        message: "Your hostel request is pending warden approval",
      });
    }

    // ==========================================
    // UPDATE LAST LOGIN
    // ==========================================

    user.lastLogin = new Date();

    await user.save();

    // ==========================================
    // GENERATE TOKEN
    // ==========================================

    const token = generateToken(user._id);

    // ==========================================
    // AUDIT LOG
    // ==========================================

    await AuditLog.create({
      user: user.name,

      role: user.role,

      action: `${user.role} logged into ERP system`,

      type: "LOGIN",

      time: "Just Now",
    });

    // ==========================================
    // RESPONSE
    // ==========================================

    return res.status(200).json({
      success: true,

      message: "Login successful",

      token,

      user: {
        _id: user._id,

        name: user.name,

        email: user.email,

        role: user.role,

        phone: user.phone,

        hostel: user.hostel,

        floor: user.floor,

        pocket: user.pocket,

        roomNumber: user.roomNumber,

        assignedHostel: user.assignedHostel,

        isApproved: user.isApproved,

        permissionPending: user.permissionPending,

        isHosteller: user.isHosteller,

        profileEditLocked: user.profileEditLocked,
      },
    });
  } catch (error) {
    console.log("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// GET PROFILE
// ==========================================

const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,

      user,
    });
  } catch (error) {
    console.log("PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// UPDATE PROFILE
// ==========================================

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    // ==========================================
    // PROFILE LOCK CHECK
    // ==========================================

    if (user.profileEditLocked) {
      return res.status(403).json({
        success: false,

        message: "Profile editing locked by Warden",
      });
    }

    // ==========================================
    // UPDATE DATA
    // ==========================================

    user.name = req.body.name || user.name;

    user.phone = req.body.phone || user.phone;

    user.hostel = req.body.hostel || user.hostel;

    user.floor = req.body.floor || user.floor;

    user.pocket = req.body.pocket || user.pocket;

    user.roomNumber = req.body.roomNumber || user.roomNumber;

    // ==========================================
    // HOSTELLER
    // ==========================================

    user.isHosteller = true;

    // ==========================================
    // RE-APPROVAL FLOW
    // ==========================================

    user.permissionPending = true;

    user.isApproved = false;

    // ==========================================
    // LOCK PROFILE
    // ==========================================

    user.profileEditLocked = true;

    // ==========================================
    // SAVE
    // ==========================================

    await user.save();

    return res.status(200).json({
      success: true,

      message: "Profile updated successfully",

      user,
    });
  } catch (error) {
    console.log("UPDATE PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// VERIFY EMAIL
// ==========================================
const verifyEmail = async (req, res) => {
  try {
    console.log("TOKEN FROM URL:", req.params.token);

    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    console.log("HASHED TOKEN:", hashedToken);

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpire: {
        $gt: Date.now(),
      },
    });

    console.log("FOUND USER:", user);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification link",
      });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpire = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.log("VERIFY EMAIL ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ==========================================
// RESEND VERIFICATION EMAIL
// ==========================================

const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(404).json({
        success: false,

        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,

        message: "Email already verified",
      });
    }

    const verificationToken = user.generateVerificationToken();

    await user.save();

    const verifyURL = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;

    const message = `
      <h2>Campus Nexus ERP</h2>

      <p>Please verify your account.</p>

      <a href="${verifyURL}">
        Verify Email
      </a>

      <p>
        This link expires in 15 minutes.
      </p>
    `;

    await sendEmail(
      user.email,

      "Verify Your Campus Nexus Account",

      message,
    );

    return res.status(200).json({
      success: true,

      message: "Verification email sent successfully",
    });
  } catch (error) {
    console.log("RESEND VERIFICATION ERROR:", error);

    return res.status(500).json({
      success: false,

      message: error.message,
    });
  }
};

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
  registerUser,
  loginUser,
  getMyProfile,
  updateProfile,
  verifyEmail,
  resendVerification,
};
