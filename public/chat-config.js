// chat-config.js

// CONSTANTS
export const API_ROOT = "/api";
export const WS_PATH = "/ws";

// Auth data
export const token = sessionStorage.getItem("token");
export const myId = Number(sessionStorage.getItem("id") || 0);
export const myUsername = sessionStorage.getItem("username") || "";

// WebRTC config
export const servers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Global state
export const state = {
  currentContext: { type: "global" },
  ws: null,
  reconnectTimer: null,
  userList: [], // untuk kontak
  allUsers: [], // untuk search
  pendingRequests: [],
  
  // Voice call variables
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  currentCallId: null,
  
  // Recording variables
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  recordTimer: 0,
  timerInterval: null
};

// Helper functions
export function authHeaders() {
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

// Cek authentication
if (!token) window.location.href = "/login.html";