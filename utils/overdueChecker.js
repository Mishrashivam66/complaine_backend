const cron = require("node-cron");

const Complaint = require("../models/Complaint");

const User = require("../models/User");

const sendNotification = require("./sendNotification");

// ==========================================
// SLA HOURS
// ==========================================

const SLA_RULES = {
  LOW: 72,

  MEDIUM: 48,

  HIGH: 24,

  CRITICAL: 12,
};

// ==========================================
// START OVERDUE CHECKER
// ==========================================

const startOverdueChecker = () => {
  console.log("Overdue Checker Started");

  // ==========================================
  // RUN EVERY 10 MINUTES
  // ==========================================

  cron.schedule(
    "*/10 * * * *",

    async () => {
      try {
        console.log("Checking Overdue Complaints...");

        // ==========================================
        // FIND ACTIVE COMPLAINTS
        // ==========================================

        const complaints = await Complaint.find({
          status: {
            $nin: ["COMPLETED", "CLOSED", "RESOLVED"],
          },
        })

          .populate(
            "student",

            "name role",
          )

          .populate(
            "createdBy",

            "name role",
          )

          .populate(
            "assignedTo",

            "name role",
          );

        // ==========================================
        // LOOP COMPLAINTS
        // ==========================================

        for (const complaint of complaints) {
          try {
            // ==========================================
            // PRIORITY
            // ==========================================

            const priority = complaint.priority || "LOW";

            // ==========================================
            // SLA HOURS
            // ==========================================

            const slaHours = SLA_RULES[priority] || 72;

            // ==========================================
            // CREATED TIME
            // ==========================================

            const createdTime = new Date(complaint.createdAt).getTime();

            // ==========================================
            // CURRENT TIME
            // ==========================================

            const currentTime = Date.now();

            // ==========================================
            // HOURS PASSED
            // ==========================================

            const hoursPassed = (currentTime - createdTime) / (1000 * 60 * 60);

            // ==========================================
            // OVERDUE CHECK
            // ==========================================

            if (hoursPassed >= slaHours && !complaint.isOverdue) {
              console.log(`Complaint Overdue: ${complaint._id}`);

              // ==========================================
              // UPDATE COMPLAINT
              // ==========================================

              complaint.isOverdue = true;

              complaint.overdueAt = new Date();

              await complaint.save();

              // ==========================================
              // STUDENT NOTIFICATION
              // ==========================================

              if (complaint.student?._id) {
                await sendNotification({
                  receiver: complaint.student._id,

                  title: "Complaint Delayed",

                  message:
                    "Your complaint resolution is delayed due to pending work.",

                  type: "OVERDUE",

                  priority: priority,

                  relatedComplaint: complaint._id,

                  actionUrl: `/complaints/${complaint._id}`,
                });
              }

              // ==========================================
              // MAINTENANCE MANAGERS
              // ==========================================

              const managers = await User.find({
                role: "MAINTENANCE_MANAGER",
              });

              for (const manager of managers) {
                await sendNotification({
                  receiver: manager._id,

                  title: "Complaint Overdue",

                  message: `Complaint ${complaint.complaintId} is overdue beyond SLA time.`,

                  type: "OVERDUE",

                  priority: priority,

                  relatedComplaint: complaint._id,

                  actionUrl: `/maintenance/complaints/${complaint._id}`,
                });
              }

              // ==========================================
              // WARDENS
              // ==========================================

              const wardens = await User.find({
                role: "WARDEN",
              });

              for (const warden of wardens) {
                await sendNotification({
                  receiver: warden._id,

                  title: "Hostel Complaint Overdue",

                  message: `Complaint ${complaint.complaintId} is overdue in hostel system.`,

                  type: "OVERDUE",

                  priority: priority,

                  relatedComplaint: complaint._id,

                  actionUrl: `/warden/complaints/${complaint._id}`,
                });
              }

              // ==========================================
              // SUPER ADMINS
              // ==========================================

              const admins = await User.find({
                role: "SUPER_ADMIN",
              });

              for (const admin of admins) {
                await sendNotification({
                  receiver: admin._id,

                  title: "Critical Overdue Complaint",

                  message: `Complaint ${complaint.complaintId} exceeded SLA limit.`,

                  type: "OVERDUE",

                  priority: "CRITICAL",

                  relatedComplaint: complaint._id,

                  isPermanent: true,

                  actionUrl: `/admin/complaint-monitor`,
                });
              }
            }
          } catch (complaintError) {
            console.log(
              "Complaint Check Error:",

              complaintError.message,
            );
          }
        }

        console.log("Overdue Check Completed");
      } catch (error) {
        console.log(
          "Overdue Checker Error:",

          error.message,
        );
      }
    },
  );
};

// ==========================================
// EXPORT
// ==========================================

module.exports = startOverdueChecker;
