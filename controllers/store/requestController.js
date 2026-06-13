
const Request =
  require("../../models/Request");

// ==========================================
// CREATE REQUEST
// ==========================================

exports.createRequest =
  async (req, res) => {

    try {

      const {

        hostel,

        item,

        quantity,

        requestedBy,

      } = req.body;

      const request =
        await Request.create({

          hostel,

          item,

          quantity,

          requestedBy,

        });

      res.status(201).json({

        success: true,

        message:
          "Request created successfully",

        request,

      });

    }

    catch (error) {

      res.status(500).json({

        success: false,

        message: error.message,

      });

    }

  };

// ==========================================
// GET ALL REQUESTS
// ==========================================

exports.getRequests =
  async (req, res) => {

    try {

      const requests =
        await Request.find()
          .sort({
            createdAt: -1,
          });

      res.status(200).json({

        success: true,

        requests,

      });

    }

    catch (error) {

      res.status(500).json({

        success: false,

        message: error.message,

      });

    }

  };

// ==========================================
// UPDATE STATUS
// ==========================================

exports.updateRequestStatus =
  async (req, res) => {

    try {

      const request =
        await Request.findByIdAndUpdate(

          req.params.id,

          {
            status:
              req.body.status,
          },

          {
            new: true,
          }

        );

      res.status(200).json({

        success: true,

        message:
          "Request updated",

        request,

      });

    }

    catch (error) {

      res.status(500).json({

        success: false,

        message: error.message,

      });

    }

  };
