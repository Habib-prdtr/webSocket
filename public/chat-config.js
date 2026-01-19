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

export function getHighPrecisionTimestamp() {
  return {
    dateNow: Date.now(),
    performanceNow: performance.now(),
    performanceTimeOrigin: performance.timeOrigin,
    isoString: new Date().toISOString()
  };
}

// Fungsi untuk menghitung latency antara dua timestamp
export function calculateLatencyBetween(sentTimestamp, receivedTimestamp = performance.now()) {
  if (!sentTimestamp) return null;
  
  // Jika sentTimestamp adalah object dari getHighPrecisionTimestamp
  if (typeof sentTimestamp === 'object' && sentTimestamp.performanceNow) {
    return Math.max(0, receivedTimestamp - sentTimestamp.performanceNow);
  }
  
  // Jika sentTimestamp adalah Date.now() integer
  if (typeof sentTimestamp === 'number' && sentTimestamp > 1e12) {
    const nowDate = Date.now();
    const nowPerf = performance.now();
    const diff = nowDate - sentTimestamp;
    return Math.max(0, nowPerf - (performance.timeOrigin + diff));
  }
  
  // Default
  return Math.max(0, receivedTimestamp - sentTimestamp);
}

// Cek authentication
if (!token) window.location.href = "/login.html";