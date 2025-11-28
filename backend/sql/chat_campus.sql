CREATE DATABASE IF NOT EXISTS chat_campus CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE chat_campus;

-- users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_online TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- rooms
CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- room members
CREATE TABLE IF NOT EXISTS room_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY ux_room_user (room_id, user_id),
  INDEX idx_room (room_id)
);

-- messages (both room messages and private/global)
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  recipient_id INT NULL, -- for private messages: recipient user id
  room_id INT NULL,      -- for room messages
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_id (room_id),
  INDEX idx_recipient (recipient_id),
  INDEX idx_sender (sender_id)
);

-- optional: quick indexes
CREATE INDEX IF NOT EXISTS idx_messages_roomid_id ON messages(room_id, id);
