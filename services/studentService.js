import api from "./api";

// ==========================================
// PROFILE
// ==========================================

export const getStudentProfile = () => api.get("/student/profile");

export const updateStudentProfile = (data) =>
  api.put("/student/profile/update-profile", data);

// ==========================================
// CHANGE PASSWORD
// ==========================================

export const changePassword = (data) =>
  api.put("/student/change-password", data);

// ==========================================
// COMPLAINTS
// ==========================================

export const createComplaint = async (data) => {
  return await api.post(
    "/student/complaints/create",

    data,
  );
};

export const getMyComplaints = () =>
  api.get("/student/complaints/my-complaints");

export const getComplaintById = (id) => api.get(`/student/complaints/${id}`);

// ==========================================
// NOTIFICATIONS
// ==========================================

export const getNotifications = (userId) => api.get(`/notifications/${userId}`);

export const markAllNotificationsRead = (userId) =>
  api.put(`/notifications/read-all/${userId}`);

// ==========================================
// HOSTEL
// ==========================================

export const getHostelDetails = () => api.get("/hostel/details");
