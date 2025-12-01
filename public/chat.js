// chat.js (full - replace)
const API_ROOT = "/api";
const WS_PATH = "/ws";

const token = sessionStorage.getItem("token");
const myId = Number(sessionStorage.getItem("id") || 0);
const myUsername = sessionStorage.getItem("username") || "";

if (!token) window.location.href = "/login.html";

// UI
const meInfoEl = document.getElementById("meInfo");
const meNameEl = document.getElementById("meName");
const roomsListEl = document.getElementById("roomsList");
const usersListEl = document.getElementById("usersList");
const messagesEl = document.getElementById("messages");

const chatTitleEl = document.getElementById("chatTitle");
const chatSubtitleEl = document.getElementById("chatSubtitle");

const msgInputEl = document.getElementById("messageInput");
const btnSend = document.getElementById("btnSend");
const btnCreateRoom = document.getElementById("btnCreateRoom");
const newRoomNameEl = document.getElementById("newRoomName");
const btnLogout = document.getElementById("btnLogout");
const btnClearChat = document.getElementById("btnClearChat");

meNameEl.textContent = myUsername;
meInfoEl.textContent = `id: ${myId}`;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const btnImage = document.getElementById("btnImage");
const btnVoice = document.getElementById("btnVoice");
const imageInputEl = document.getElementById("imageInput");

let recordTimer = 0;
let timerInterval;
const recordPopup = document.getElementById("recordPopup");
const recordTimerEl = document.getElementById("recordTimer");
const btnCancelRecord = document.getElementById("btnCancelRecord");

// State
let currentContext = { type: "global" };
let ws = null;
let reconnectTimer = null;

// Voice Call Variables
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let currentCallId = null;
const servers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// UI Elements untuk panggilan
const callContainer = document.getElementById("callContainer");
const callStatus = document.getElementById("callStatus");
const btnAnswerCall = document.getElementById("btnAnswerCall");
const btnRejectCall = document.getElementById("btnRejectCall");
const btnEndCall = document.getElementById("btnEndCall");
const localAudio = document.getElementById("localAudio");
const remoteAudio = document.getElementById("remoteAudio");
const callerName = document.getElementById("callerName");

// Tambahkan event listener untuk panggilan
if (btnAnswerCall) btnAnswerCall.addEventListener("click", answerCall);
if (btnRejectCall) btnRejectCall.addEventListener("click", rejectCall);
if (btnEndCall) btnEndCall.addEventListener("click", endCall);

console.log = (function(origLog) {
  return function(...args) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    origLog.apply(console, [`[${timestamp}]`, ...args]);
    
    // Juga tampilkan di UI untuk debug (opsional)
    const debugDiv = document.getElementById('debugConsole');
    if (debugDiv) {
      debugDiv.innerHTML += `<div>[${timestamp}] ${args.join(' ')}</div>`;
      debugDiv.scrollTop = debugDiv.scrollHeight;
    }
  };
})(console.log);

function authHeaders() {
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function renderMessage(m) {
  const bubble = document.createElement("div");
  bubble.className = "message " + (m.sender_id === myId ? "me" : "other");

  const author = document.createElement("div");
  author.className = "author";
  // if username present use it, otherwise fallback
  author.textContent = m.username || (m.sender_id === myId ? myUsername : "");
  bubble.appendChild(author);

  const fileUrl = m.file_url || m.file_path;

  if (m.file_type === "image") {
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "msg-image";
    bubble.appendChild(img);
  }
  else if (m.file_type === "audio" || m.file_type === "voice") {
    const audio = document.createElement("audio");
    audio.src = fileUrl;
    audio.controls = true;
    bubble.appendChild(audio);
  }
  else {
    const txt = document.createElement("div");
    txt.textContent = m.content;
    bubble.appendChild(txt);
  }

  messagesEl.appendChild(bubble);
  scrollToBottom();
}

function shouldShowMessageForContext(m) {
  console.log('🔍 CHECKING MESSAGE CONTEXT:', {
    currentContext,
    message: {
      room_id: m.room_id,
      recipient_id: m.recipient_id,
      sender_id: m.sender_id
    }
  });

  if (currentContext.type === "global") {
    const shouldShow = !m.room_id && !m.recipient_id;
    console.log('🌍 GLOBAL CHECK:', shouldShow);
    return shouldShow;
  }
  
  if (currentContext.type === "room") {
    const shouldShow = Number(m.room_id) === Number(currentContext.roomId);
    console.log('🏠 ROOM CHECK:', shouldShow);
    return shouldShow;
  }
  
  if (currentContext.type === "private") {
    const other = Number(currentContext.userId);
    const recipientId = Number(m.recipient_id || 0);
    const senderId = Number(m.sender_id);

    const shouldShow =
      (senderId === myId && recipientId === other) ||
      (senderId === other && recipientId === myId);

    console.log('🔒 PRIVATE CHECK:', { senderId, recipientId, myId, other, shouldShow });

    return shouldShow;
  }
    
  return false;
}

async function loadInit() {
  const res = await fetch(API_ROOT + "/init", {
    headers: { Authorization: "Bearer " + token },
  });
  const data = await res.json();

  renderRooms(data.rooms || []);
  renderUsers(data.users || []);

  clearMessages();
  (data.messages || []).forEach((m) => {
    if (!m.room_id && !m.recipient_id) {
      m.username = `Global — ${m.username}`;
      renderMessage(m);
    }
  });
}

function renderRooms(list) {
  roomsListEl.innerHTML = "";

  // Global
  const g = document.createElement("div");
  g.className = "roomItem";
  g.textContent = "Global";
  g.onclick = () => setContext({ type: "global" });
  roomsListEl.appendChild(g);

  list.forEach((r) => {
    const el = document.createElement("div");
    el.className = "roomItem";
    el.textContent = r.name;
    el.onclick = () =>
      setContext({ type: "room", roomId: r.id, name: r.name });
    roomsListEl.appendChild(el);
  });
}

function renderUsers(list) {
  usersListEl.innerHTML = "";

  list
    .filter(u => u.id !== myId)
    .forEach((u) => {
      const el = document.createElement("div");
      el.className = "userItem";
      el.innerHTML = `
        <div class="user-info">
          <div>${u.username}</div>
          <div class="userStatus">${u.is_online ? "online" : "offline"}</div>
        </div>
        <div class="user-actions">
          <button class="btn-call" onclick="startCall(${u.id})" ${!u.is_online ? 'disabled' : ''}>📞</button>
        </div>
      `;
      el.onclick = () =>
        setContext({ type: "private", userId: u.id, username: u.username });
      usersListEl.appendChild(el);
    });
}

async function setContext(ctx) {
  // Jangan clear messages di sini - biarkan proses load yang handle
  currentContext = ctx;

  if (ctx.type === "global") {
    chatTitleEl.textContent = "Global";
    chatSubtitleEl.textContent = "Public global chat";

    const init = await fetch(API_ROOT + "/init", {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await init.json();
    
    // Clear messages HANYA setelah dapat data baru
    clearMessages();
    (data.messages || [])
      .filter((m) => !m.room_id && !m.recipient_id)
      .forEach((m) => {
        m.username = `Global — ${m.username}`;
        renderMessage(m);
      });

    updateClearBtnVisibility();
    return;
  }

  if (ctx.type === "room") {
    chatTitleEl.textContent = ctx.name;
    chatSubtitleEl.textContent = "Room chat";

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "join_room", roomId: ctx.roomId }));
    }

    const res = await fetch(
      `${API_ROOT}/rooms/${ctx.roomId}/messages?page=1&limit=100`,
      { headers: { Authorization: "Bearer " + token } }
    );
    const json = await res.json();
    
    // Clear messages HANYA setelah dapat data baru
    clearMessages();
    (json.messages || []).forEach(renderMessage);

    updateClearBtnVisibility();
    return;
  }

  if (ctx.type === "private") {
    chatTitleEl.textContent = "Private — " + ctx.username;
    chatSubtitleEl.textContent = "Direct message";

    try {
      // Use usernames in private fetch (backend expects usernames)
      const res = await fetch(
        `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(ctx.username)}`,
        { headers: { Authorization: "Bearer " + token } }
      );
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const json = await res.json();
      
      // Clear messages HANYA setelah dapat data baru
      clearMessages();
      (json.messages || []).forEach(renderMessage);
    } catch (error) {
      console.error('Error loading private messages:', error);
      clearMessages();
      
      // Tampilkan pesan error
      const errorMsg = document.createElement("div");
      errorMsg.className = "system-message error";
      errorMsg.textContent = "Gagal memuat pesan: " + error.message;
      messagesEl.appendChild(errorMsg);
    }

    updateClearBtnVisibility();
    return;
  }

  updateClearBtnVisibility();
}

function updateClearBtnVisibility() {
  if (btnClearChat) {
    if (currentContext.type === "global" || currentContext.type === "room" || currentContext.type === "private") {
      btnClearChat.style.display = "inline-block";
    } else {
      btnClearChat.style.display = "none";
    }
  }
}

function connectWS() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}${WS_PATH}?token=${token}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("WS Connected!");
    if (currentContext.type === "room") {
      ws.send(JSON.stringify({ type: "join_room", roomId: currentContext.roomId }));
    }
  };

  ws.onmessage = (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch (e) { return; }
    handleWS(data);
  };

  ws.onclose = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWS, 2500);
  };

  ws.onerror = (e) => console.error("WebSocket error", e);
}

function handleWS(data) {
  console.log('📨 WS MESSAGE RECEIVED:', data.type, data);

  switch (data.type) {
    case "init":
      if (data.rooms) renderRooms(data.rooms);
      if (data.users) renderUsers(data.users);
      break;

    case "room_created":
      loadInit();
      break;

    case "global_message":
      if (currentContext.type === "global") {
        console.log('✅ RENDERING GLOBAL MESSAGE');
        renderMessage(data.message);
      }
      break;

    case "room_message":
      if (data.message && shouldShowMessageForContext(data.message)) {
        console.log('✅ RENDERING ROOM MESSAGE');
        renderMessage(data.message);
      }
      break;

    case "private_message":
      if (data.message && shouldShowMessageForContext(data.message)) {
        console.log('✅ RENDERING PRIVATE MESSAGE');
        data.message.username = data.message.username || (data.message.sender_id === myId ? myUsername : currentContext.username);
        renderMessage(data.message);
      }
      break;

    case "file_message":
      console.log('📁 FILE MESSAGE RECEIVED:', data.message);
      if (data.message && shouldShowMessageForContext(data.message)) {
        console.log('✅ RENDERING FILE MESSAGE');
        // Pastikan username ada
        data.message.username = data.message.username || (data.message.sender_id === myId ? myUsername : currentContext.username);
        renderMessage(data.message);
      } else {
        console.log('❌ FILE MESSAGE FILTERED OUT - Context mismatch');
      }
      break;

    case "call_offer":
      console.log('📞 Menerima panggilan dari:', data.callerName);
      handleIncomingCall(data);
      break;
      
    case "call_answer":
      console.log('📞 Panggilan dijawab');
      handleCallAnswer(data);
      break;
      
    case "ice_candidate":
      console.log('📞 Menerima ICE candidate');
      handleICECandidate(data);
      break;
      
    case "call_end":
      console.log('📞 Panggilan berakhir');
      alert("Panggilan berakhir");
      cleanupCall();
      break;
      
    case "call_rejected":
      console.log('📞 Panggilan ditolak');
      alert("Panggilan ditolak");
      cleanupCall();
      break;
      
    case "call_failed":
      console.log('📞 Panggilan gagal:', data.reason);
      alert("Panggilan gagal: " + data.reason);
      cleanupCall();
      break;

    default:
      console.log('❓ UNKNOWN WS MESSAGE TYPE:', data.type);
      break;
  }
}

async function sendMessage() {
  const txt = msgInputEl.value.trim();
  if (!txt) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  if (currentContext.type === "global") {
    ws.send(JSON.stringify({ type: "global_message", content: txt }));
  } else if (currentContext.type === "room") {
    ws.send(JSON.stringify({ type: "room_message", roomId: currentContext.roomId, content: txt }));
  } else if (currentContext.type === "private") {
    ws.send(JSON.stringify({
      type: "private_message",
      recipientId: currentContext.userId,
      content: txt
    }));
  }

  msgInputEl.value = "";
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  let endpoint = "";
  let fileType = "";

  if (file.type.startsWith("image")) {
    endpoint = "/api/upload/image";
    fileType = "image";
  } else if (file.type.startsWith("audio")) {
    endpoint = "/api/upload/voice";
    fileType = "audio";
  } else {
    alert("Unsupported file type!");
    return;
  }

  if (currentContext.type === "room") formData.append("roomId", currentContext.roomId);
  if (currentContext.type === "private") formData.append("recipientId", currentContext.userId);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData,
  });

  const data = await res.json();
  if (!data.fileUrl) {
    console.error("Upload failed:", data);
    return;
  }
}

async function createRoom() {
  const name = newRoomNameEl.value.trim();
  if (!name) return;

  const res = await fetch(API_ROOT + "/rooms", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });

  const json = await res.json();
  newRoomNameEl.value = "";
}

function logout() {
  sessionStorage.clear();
  window.location.href = "/login.html";
}

btnSend.addEventListener("click", sendMessage);
msgInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});
btnCreateRoom.addEventListener("click", createRoom);
btnLogout.addEventListener("click", logout);

btnImage.addEventListener("click", () => imageInputEl.click());

imageInputEl.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await uploadFile(file);
  e.target.value = "";
});

// Voice recording handlers (unchanged)
btnVoice.addEventListener("click", async () => {
  if (!isRecording) {
    startRecording();
  } else {
    finishRecording();
  }
});

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];
  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.start();
  isRecording = true;

  // UI update
  btnVoice.textContent = "Send";
  btnVoice.classList.add("recording");
  recordPopup.classList.remove("hidden");

  recordTimer = 0;
  recordTimerEl.textContent = "0:00";
  timerInterval = setInterval(() => {
    recordTimer++;
    const m = Math.floor(recordTimer / 60);
    const s = String(recordTimer % 60).padStart(2, "0");
    recordTimerEl.textContent = `${m}:${s}`;
  }, 1000);
}

function stopRecording(cancel = false) {
  if (!isRecording) return;
  isRecording = false;
  mediaRecorder.stop();
  clearInterval(timerInterval);

  btnVoice.textContent = "🎤";
  btnVoice.classList.remove("recording");
  recordPopup.classList.add("hidden");

  if (cancel) {
    audioChunks = [];
    return;
  }

  mediaRecorder.onstop = () => {
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    uploadVoiceBlob(audioBlob);
  };
}

async function uploadVoiceBlob(blob) {
  const formData = new FormData();
  formData.append("file", blob, "voice.webm");

  if (currentContext.type === "room") formData.append("roomId", currentContext.roomId);
  if (currentContext.type === "private") formData.append("recipientId", currentContext.userId);

  const res = await fetch("/api/upload/voice", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData,
  });

  const data = await res.json();
  if (!data.fileUrl) return;
}

btnCancelRecord.addEventListener("click", () => {
  stopRecording(true);
});

function finishRecording() {
  stopRecording(false);
}

async function clearChat() {
  if (!currentContext.type) return;

  if (!confirm("Bersihkan chat hanya untuk Anda? Hanya pesan yang Anda kirim yang akan dihapus, pesan lawan bicara tetap ada.")) return;

  let url = "";

  if (currentContext.type === "global") {
    url = `/api/chat/clear/global`;
  } else if (currentContext.type === "room") {
    url = `/api/chat/clear/room/${currentContext.roomId}`;
  } else if (currentContext.type === "private") {
    url = `/api/chat/clear/private/${currentContext.userId}`;
  }

  console.log("🚀 ONE-SIDED PHYSICAL DELETE REQUEST:", url);

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });

    const result = await res.json();
    console.log("✅ ONE-SIDED PHYSICAL DELETE RESULT:", result);

    if (result.success) {
      // Clear UI immediately
      clearMessages();
      
      // Show success message
      const successMsg = document.createElement("div");
      successMsg.className = "system-message success";
      successMsg.textContent = `✅ Berhasil menghapus ${result.deletedCount || 0} pesan (hanya untuk Anda)`;
      messagesEl.appendChild(successMsg);
      
      // Reload context untuk lihat pesan yang tersisa
      setTimeout(() => {
        console.log("🔄 RELOADING CONTEXT AFTER CLEAR");
        setContext(currentContext);
      }, 500);
    } else {
      alert("❌ Gagal membersihkan chat");
    }
  } catch (err) {
    console.error("❌ Clear chat error:", err);
    alert("❌ Terjadi error saat membersihkan chat");
  }
}

if (btnClearChat) {
  btnClearChat.addEventListener("click", clearChat);
}

// Fungsi untuk memulai panggilan - YANG DIPERBAIKI
async function startCall(targetUserId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert("Tidak terhubung ke server");
    return;
  }

  if (currentCallId) {
    alert("Sedang dalam panggilan");
    return;
  }

  try {
    console.log('📞 Starting call to user:', targetUserId);
    
    // Dapatkan akses microphone
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true, 
        autoGainControl: true
      },
      video: false 
    });
    
    // Setup peer connection
    peerConnection = new RTCPeerConnection(servers);
    
    // Add local stream
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('✅ Received remote stream');
      remoteStream = event.streams[0];
      if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
        remoteAudio.play().catch(e => console.log('Audio play error:', e));
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && currentCallId) {
        console.log('📞 Sending ICE candidate');
        ws.send(JSON.stringify({
          type: "ice_candidate",
          candidate: event.candidate,
          callId: currentCallId,
          targetUserId: targetUserId
        }));
      }
    };

    // Handle connection state
    peerConnection.onconnectionstatechange = () => {
      console.log('📞 Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        console.log('✅ Peer connection established!');
        showCallUI("Sedang Berbicara...", true);
      }
    };

    // Buat offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Generate call ID
    currentCallId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    window.currentCalleeId = targetUserId; // Simpan target user ID

    // Kirim offer ke server
    ws.send(JSON.stringify({
      type: "call_offer",
      targetUserId: targetUserId,
      offer: offer,
      callId: currentCallId
    }));

    // Tampilkan UI panggilan
    showCallUI("Memanggil...", true);
    
    console.log(`📞 Call started to user ${targetUserId}, Call ID: ${currentCallId}`);

    // Timeout jika tidak dijawab dalam 30 detik
    setTimeout(() => {
      if (currentCallId && peerConnection.connectionState !== 'connected') {
        console.log('❌ Call timeout - no answer');
        alert("Panggilan tidak dijawab");
        endCall();
      }
    }, 30000);

  } catch (error) {
    console.error("Error starting call:", error);
    if (error.name === 'NotAllowedError') {
      alert("Akses microphone ditolak. Izinkan akses microphone untuk melakukan panggilan.");
    } else {
      alert("Gagal memulai panggilan: " + error.message);
    }
    cleanupCall();
  }
}

// Fungsi untuk menjawab panggilan
// Fungsi untuk menjawab panggilan - YANG DIPERBAIKI
async function answerCall() {
  if (!currentCallId) {
    console.log('❌ No active call to answer');
    return;
  }

  try {
    console.log('📞 Answering call:', currentCallId);
    
    // Dapatkan akses microphone SAAT menjawab panggilan
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }, 
      video: false 
    });
    
    // Setup peer connection
    peerConnection = new RTCPeerConnection(servers);
    
    // Add local stream
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('✅ Received remote stream');
      remoteStream = event.streams[0];
      if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
        remoteAudio.play().catch(e => console.log('Audio play error:', e));
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && currentCallId) {
        console.log('📞 Sending ICE candidate');
        ws.send(JSON.stringify({
          type: "ice_candidate",
          candidate: event.candidate,
          callId: currentCallId,
          targetUserId: getCallerIdFromActiveCall() // perlu fungsi helper
        }));
      }
    };

    // Handle connection state
    peerConnection.onconnectionstatechange = () => {
      console.log('📞 Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        console.log('✅ Peer connection established!');
      }
    };

    // Set remote description dari offer yang sudah diterima
    // Kita perlu menyimpan offer yang masuk
    if (window.pendingOffer && window.pendingCallId === currentCallId) {
      await peerConnection.setRemoteDescription(window.pendingOffer);
      
      // Buat answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // Kirim answer ke server
      ws.send(JSON.stringify({
        type: "call_answer",
        callId: currentCallId,
        answer: answer
      }));

      showCallUI("Sedang Berbicara...", false);
      console.log('✅ Call answered successfully');
      
    } else {
      console.log('❌ No pending offer found');
      endCall();
    }

  } catch (error) {
    console.error("Error answering call:", error);
    alert("Gagal menjawab panggilan: " + error.message);
    endCall();
  }
}

// Helper function untuk mendapatkan caller ID
function getCallerIdFromActiveCall() {
  // Anda perlu menyimpan informasi caller
  return window.currentCallerId || null;
}

// Fungsi untuk menolak panggilan
function rejectCall() {
  if (currentCallId) {
    ws.send(JSON.stringify({
      type: "call_reject",
      callId: currentCallId
    }));
  }
  cleanupCall();
}

// Fungsi untuk mengakhiri panggilan
function endCall() {
  if (currentCallId) {
    ws.send(JSON.stringify({
      type: "call_end",
      callId: currentCallId
    }));
  }
  cleanupCall();
}

// Fungsi untuk membersihkan panggilan
function cleanupCall() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  currentCallId = null;
  remoteStream = null;
  
  // Sembunyikan UI panggilan
  hideCallUI();
}

// Fungsi untuk menampilkan UI panggilan
function showCallUI(status, isCaller = false) {
  if (callContainer && callStatus) {
    callContainer.style.display = 'block';
    callStatus.textContent = status;
    
    // Tampilkan tombol yang sesuai
    if (btnAnswerCall) btnAnswerCall.style.display = isCaller ? 'none' : 'inline-block';
    if (btnRejectCall) btnRejectCall.style.display = isCaller ? 'none' : 'inline-block';
    if (btnEndCall) btnEndCall.style.display = 'inline-block';
  }
}

// Fungsi untuk menyembunyikan UI panggilan
function hideCallUI() {
  if (callContainer) {
    callContainer.style.display = 'none';
  }
}

// Handler untuk panggilan masuk - YANG DIPERBAIKI
// Handler untuk panggilan masuk - VERSI FINAL
async function handleIncomingCall(data) {
  console.log('📞 Handling incoming call from:', data.callerName, 'Call ID:', data.callId);
  
  if (currentCallId) {
    console.log('❌ Already in call, rejecting automatically');
    ws.send(JSON.stringify({
      type: "call_reject", 
      callId: data.callId
    }));
    return;
  }

  try {
    // SIMPAN data panggilan untuk digunakan nanti
    currentCallId = data.callId;
    window.pendingOffer = data.offer;
    window.pendingCallId = data.callId;
    window.currentCallerId = data.callerId;
    
    // Tampilkan UI panggilan
    if (callerName) callerName.textContent = data.callerName;
    showCallUI("Panggilan Masuk...", false);
    
    console.log('✅ Call UI shown, waiting for user action');

  } catch (error) {
    console.error("Error handling incoming call:", error);
    rejectCall();
  }
}

// Handler untuk jawaban panggilan
// Handler untuk jawaban panggilan - YANG DIPERBAIKI
async function handleCallAnswer(data) {
  console.log('📞 Received call answer:', data.callId);
  
  if (peerConnection && currentCallId === data.callId) {
    try {
      await peerConnection.setRemoteDescription(data.answer);
      console.log('✅ Remote description set successfully');
      
      // Connection state change handler akan menangani UI update
    } catch (error) {
      console.error('Error setting remote description:', error);
      endCall();
    }
  } else {
    console.log('❌ No matching peer connection for call answer');
  }
}

// Handler untuk ICE candidate
async function handleICECandidate(data) {
  if (peerConnection && currentCallId === data.callId) {
    await peerConnection.addIceCandidate(data.candidate);
  }
}

(async function init() {
  // initial UI state
  updateClearBtnVisibility();
  await loadInit();
  connectWS();
})();
