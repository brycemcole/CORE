const sql = require("mssql");
const crypto = require("crypto");

const notificationQueries = {
  // Fetch all unread notifications for a specific user
  getUnreadNotifications: async (userId) => {
    try {
      const result = await sql.query`
        SELECT notifications.*, sender.username as senderUsername, receiver.username as receiverUsername, sender.avatar as senderProfilePicture
        FROM notifications 
        INNER JOIN users as sender ON notifications.senderUserId = sender.id
        INNER JOIN users as receiver ON notifications.receiverUserId = receiver.id
        WHERE notifications.receiverUserId = ${userId} AND notifications.isRead = 0 
        ORDER BY notifications.createdAt DESC`;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getUnreadNotificationCount: async (userId) => {
    try {
      const result = await sql.query`
        SELECT COUNT(*) as count
        FROM notifications
        WHERE receiverUserId = ${userId} AND isRead = 0`;
      return result.recordset[0].count;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  getReadNotifications: async (userId) => {
    try {
      const result = await sql.query`
        SELECT notifications.*, sender.username as senderUsername, receiver.username as receiverUsername, sender.avatar as senderProfilePicture
        FROM notifications 
        INNER JOIN users as sender ON notifications.senderUserId = sender.id
        INNER JOIN users as receiver ON notifications.receiverUserId = receiver.id
        WHERE notifications.receiverUserId = ${userId} AND notifications.isRead = 1 
        ORDER BY notifications.createdAt DESC`;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  // Mark a specific notification as read
  markAsRead: async (notificationId) => {
    try {
      await sql.query`
        UPDATE notifications 
        SET isRead = 1 
        WHERE id = ${notificationId}`;
    } catch (err) {
      console.error("Database update error:", err);
      throw err;
    }
  },

  // Create a new notification
  createNotification: async (
    senderUserId,
    receiverUserId,
    type,
    postId = ""
  ) => {
    try {
      const createdAt = new Date();
      await sql.query`INSERT INTO notifications (type, isRead, createdAt, receiverUserId, senderUserId, postId) VALUES (${type}, 0, ${createdAt}, ${receiverUserId}, ${senderUserId}, ${postId})`;
    } catch (err) {
      console.error("Database insert error:", err);
      throw err;
    }
  },

  // delete notification if it is unread and action is undone
  deleteNotification: async (notificationId) => {
    try {
      await sql.query`
        DELETE FROM notifications 
        WHERE id = ${notificationId}`;
    } catch (err) {
      console.error("Database delete error:", err);
      throw err;
    }
  },

  // Fetch all notifications for a specific user
  getAllNotifications: async (userId) => {
    try {
      const result = await sql.query`
      SELECT notifications.*, sender.username as senderUsername, receiver.username as receiverUsername, sender.avatar as senderProfilePicture
      FROM notifications 
      INNER JOIN users as sender ON notifications.senderUserId = sender.id
      INNER JOIN users as receiver ON notifications.receiverUserId = receiver.id
      WHERE notifications.receiverUserId = ${userId}
      ORDER BY notifications.createdAt DESC`;
      return result.recordset;
    } catch (err) {
      console.error("Database query error:", err);
      throw err;
    }
  },

  // Delete a specific notification
  deleteNotification: async (notificationId) => {
    try {
      await sql.query`
        DELETE FROM notifications 
        WHERE id = ${notificationId}`;
    } catch (err) {
      console.error("Database delete error:", err);
      throw err;
    }
  },

  // Mark all notifications as read for a specific user
  markAllAsRead: async (userId) => {
    try {
      await sql.query`
        UPDATE notifications 
        SET isRead = 1 
        WHERE userId = ${userId}`;
    } catch (err) {
      console.error("Database update error:", err);
      throw err;
    }
  },
};

module.exports = notificationQueries;
