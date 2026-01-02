import { 
  API_ROOT, WS_PATH, token, myId, myUsername,
  state, servers, authHeaders 
} from './chat-config.js';

import {
  elements,
  initUI, setupEventListenerss,clearMessages, renderMessage,
  shouldShowMessageForContext, renderRooms, renderContacts,
  renderPendingRequests, renderSearchResults,
  updateUserStatus, updateChatTitle, updateClearBtnVisibility,
  updateRecordingUI, updateRecordTimer, showCallUI, hideCallUI,
  setCallerName, showAddContactModal, closeAddContactModal, updatePendingBadge
} from './chat-ui.js';


// Override console.log untuk timestamp
const origLog = console.log;
console.log = function(...args) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  origLog.apply(console, [`[${timestamp}]`, ...args]);
  
  const debugDiv = document.getElementById('debugConsole');
  if (debugDiv) {
    debugDiv.innerHTML += `<div>[${timestamp}] ${args.join(' ')}</div>`;
    debugDiv.scrollTop = debugDiv.scrollHeight;
  }
};

// Deklarasi fungsi yang akan digunakan
let timerInterval;

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Chat buttons
  if (elements.btnSend) {
    elements.btnSend.addEventListener("click", sendMessage);
  }
  
  if (elements.msgInputEl) {
    elements.msgInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  
  if (elements.btnCreateRoom) {
    elements.btnCreateRoom.addEventListener("click", createRoom);
  }
  
  if (elements.btnLogout) {
    elements.btnLogout.addEventListener("click", logout);
  }
  
  if (elements.btnImage) {
    elements.btnImage.addEventListener("click", () => {
      if (elements.imageInputEl) elements.imageInputEl.click();
    });
  }
  
  if (elements.imageInputEl) {
    elements.imageInputEl.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await uploadFile(file);
      e.target.value = "";
    });
  }
  
  // Voice recording
  if (elements.btnVoice) {
    elements.btnVoice.addEventListener("click", async () => {
      if (!state.isRecording) {
        startRecording();
      } else {
        finishRecording();
      }
    });
  }
  
  if (elements.btnCancelRecord) {
    elements.btnCancelRecord.addEventListener("click", () => {
      stopRecording(true);
    });
  }
  
  // Clear chat
  if (elements.btnClearChat) {
    elements.btnClearChat.addEventListener("click", clearChat);
  }
  
  // Call buttons
  if (elements.btnAnswerCall) {
    elements.btnAnswerCall.addEventListener("click", answerCall);
  }
  
  if (elements.btnRejectCall) {
    elements.btnRejectCall.addEventListener("click", rejectCall);
  }
  
  if (elements.btnEndCall) {
    elements.btnEndCall.addEventListener("click", endCall);
  }
  
  // Contacts buttons - PERBAIKAN DISINI: Hapus duplikasi
  // TIDAK PERLU: Event listeners sudah ada di chat-ui.js
  // setupEventListeners()
}

// ==================== CONTACTS FUNCTIONS ====================
export async function loadContacts() {
  try {
    const res = await fetch(`${API_ROOT}/contacts`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) throw new Error('Failed to load contacts');
    
    const data = await res.json();
    state.userList = data.contacts || [];
    renderContacts(state.userList, setContext, startCall);
    
    return state.userList;
  } catch (error) {
    console.error('Error loading contacts:', error);
    return [];
  }
}

// Load pending requests dengan debugging
export async function loadPendingRequests() {
  try {
    console.log('🔄 Loading pending requests...');
    
    const res = await fetch(`${API_ROOT}/contacts/pending`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      console.error('Failed to load requests:', res.status, res.statusText);
      throw new Error('Failed to load requests');
    }
    
    const data = await res.json();
    console.log('📨 Pending requests data:', data);
    
    state.pendingRequests = data.pending || [];
    renderPendingRequests(state.pendingRequests);
    updatePendingBadge(state.pendingRequests.length);
    
    return state.pendingRequests;
  } catch (error) {
    console.error('Error loading requests:', error);
    alert('Gagal memuat request: ' + error.message);
    return [];
  }
}

export async function searchUsers() {
  const query = elements.searchContactInput?.value.trim();
  if (!query || query.length < 2) {
    alert('Please enter at least 2 characters');
    return;
  }
  
  try {
    const res = await fetch(`${API_ROOT}/contacts/search`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    
    if (!res.ok) throw new Error('Search failed');
    
    const data = await res.json();
    renderSearchResults(data.users || []);
  } catch (error) {
    console.error('Search error:', error);
    alert('Failed to search users');
  }
}

export async function sendContactRequest(username) {
  try {
    const res = await fetch(`${API_ROOT}/contacts/request`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      alert(`Contact request sent to ${username}`);
      return { success: true, data };
    } else {
      alert(`Failed: ${data.error}`);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('Send request error:', error);
    alert('Failed to send request');
    return { success: false, error: error.message };
  }
}

export async function acceptContactRequest(requestId) {
  try {
    const res = await fetch(`${API_ROOT}/contacts/accept/${requestId}`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      // Reload contacts
      await loadContacts();
      await loadPendingRequests();
      alert('Contact request accepted');
      return { success: true, data };
    } else {
      alert(`Failed: ${data.error}`);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('Accept error:', error);
    alert('Failed to accept request');
    return { success: false, error: error.message };
  }
}

export async function rejectContactRequest(requestId) {
  try {
    const res = await fetch(`${API_ROOT}/contacts/reject/${requestId}`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      await loadPendingRequests();
      alert('Contact request rejected');
      return { success: true, data };
    } else {
      alert(`Failed: ${data.error}`);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('Reject error:', error);
    alert('Failed to reject request');
    return { success: false, error: error.message };
  }
}

export async function removeContact(contactId) {
  try {
    const res = await fetch(`${API_ROOT}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      // Reload contacts
      await loadContacts();
      alert('Contact removed');
      return { success: true, data };
    } else {
      alert(`Failed: ${data.error}`);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('Remove error:', error);
    alert('Failed to remove contact');
    return { success: false, error: error.message };
  }
}

// ==================== CHAT FUNCTIONS ====================
async function loadInit() {
  try {
    const res = await fetch(API_ROOT + "/init", {
      headers: { Authorization: "Bearer " + token },
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const data = await res.json();
    console.log('📦 Loaded init data:', data);

    // Render rooms
    renderRooms(data.rooms || [], setContext);
    
    // Load contacts from init data
    if (data.contacts) {
      state.userList = data.contacts;
      renderContacts(data.contacts, setContext, startCall);
    } else {
      // Fallback: load contacts separately
      await loadContacts();
    }
    
    // Update pending badge
    if (data.pendingCount !== undefined) {
      updatePendingBadge(data.pendingCount);
    }

    // Load global messages
    clearMessages();
    (data.messages || []).forEach((m) => {
      if (!m.room_id && !m.recipient_id) {
        m.username = `Global — ${m.username}`;
        renderMessage(m);
      }
    });
    
  } catch (error) {
    console.error('Error loading init:', error);
    alert('Gagal memuat data awal');
  }
}

async function setContext(ctx) {
  console.log('🔄 Setting context:', ctx);
  state.currentContext = ctx;

  if (ctx.type === "global") {
    updateChatTitle("Global", "Public global chat");

    try {
      const res = await fetch(API_ROOT + "/init", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      
      clearMessages();
      (data.messages || [])
        .filter((m) => !m.room_id && !m.recipient_id)
        .forEach((m) => {
          m.username = `Global — ${m.username}`;
          renderMessage(m);
        });
    } catch (error) {
      console.error('Error loading global messages:', error);
    }

    updateClearBtnVisibility();
    return;
  }

  if (ctx.type === "room") {
    updateChatTitle(ctx.name, "Room chat");

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: "join_room", roomId: ctx.roomId }));
    }

    try {
      const res = await fetch(
        `${API_ROOT}/rooms/${ctx.roomId}/messages?page=1&limit=100`,
        { headers: { Authorization: "Bearer " + token } }
      );
      const json = await res.json();
      
      clearMessages();
      (json.messages || []).forEach(renderMessage);
    } catch (error) {
      console.error('Error loading room messages:', error);
    }

    updateClearBtnVisibility();
    return;
  }

  if (ctx.type === "private") {
    updateChatTitle("Private — " + ctx.username, "Direct message");

    try {
      const res = await fetch(
        `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(ctx.username)}`,
        { headers: { Authorization: "Bearer " + token } }
      );
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      
      const json = await res.json();
      
      clearMessages();
      (json.messages || []).forEach(renderMessage);
    } catch (error) {
      console.error('Error loading private messages:', error);
      clearMessages();
      
      const errorMsg = document.createElement("div");
      errorMsg.className = "system-message error";
      errorMsg.textContent = "Error: " + error.message;
      if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
      
      // Jika error karena bukan kontak, show suggestion
      if (error.message.includes('contact')) {
        const suggestion = document.createElement("div");
        suggestion.className = `
          system-message info
          flex flex-col gap-3
          p-4 mt-3
          rounded-xl
          bg-blue-50 dark:bg-blue-900/20
          border border-blue-200 dark:border-blue-700
          text-center
        `;

        suggestion.innerHTML = `
          <p class="text-sm text-blue-700 dark:text-blue-300">
            You need to add this user as a contact first.
          </p>

          <button
            id="btnAddThisContact"
            class="bg-indigo-500 hover:bg-indigo-600
                  text-white text-sm
                  px-4 py-2 rounded-full
                  transition shadow">
            Add ${ctx.username} as Contact
          </button>
        `;

        elements.messagesEl.appendChild(suggestion);
        
        document.getElementById('btnAddThisContact')?.addEventListener('click', async () => {
          await sendContactRequest(ctx.username);
        });
      }
    }

    updateClearBtnVisibility();
    return;
  }

  updateClearBtnVisibility();
}

async function sendMessage() {
  if (!elements.msgInputEl) return;
  
  const txt = elements.msgInputEl.value.trim();
  if (!txt) return;
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    alert("Tidak terhubung ke server");
    return;
  }

  if (state.currentContext.type === "global") {
    state.ws.send(JSON.stringify({ type: "global_message", content: txt }));
  } else if (state.currentContext.type === "room") {
    state.ws.send(JSON.stringify({ 
      type: "room_message", 
      roomId: state.currentContext.roomId, 
      content: txt 
    }));
  } else if (state.currentContext.type === "private") {
    state.ws.send(JSON.stringify({
      type: "private_message",
      recipientId: state.currentContext.userId,
      content: txt
    }));
  }

  elements.msgInputEl.value = "";
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

  if (state.currentContext.type === "room") {
    formData.append("roomId", state.currentContext.roomId);
  }
  if (state.currentContext.type === "private") {
    formData.append("recipientId", state.currentContext.userId);
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    if (!data.fileUrl) {
      console.error("Upload failed:", data);
      alert("Upload gagal");
    }
  } catch (error) {
    console.error("Upload error:", error);
    alert("Error saat upload");
  }
}

async function createRoom() {
  if (!elements.newRoomNameEl) return;
  
  const name = elements.newRoomNameEl.value.trim();
  if (!name) return;

  try {
    const res = await fetch(API_ROOT + "/rooms", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });

    const json = await res.json();
    elements.newRoomNameEl.value = "";
    
    // Reload rooms list
    loadInit();
  } catch (error) {
    console.error("Error creating room:", error);
  }
}

function logout() {
  sessionStorage.clear();
  window.location.href = "/login.html";
}

// ==================== RECORDING FUNCTIONS ====================
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.mediaRecorder = new MediaRecorder(stream);
    state.audioChunks = [];
    
    state.mediaRecorder.ondataavailable = e => state.audioChunks.push(e.data);
    state.mediaRecorder.start();
    state.isRecording = true;

    updateRecordingUI(true);

    state.recordTimer = 0;
    timerInterval = setInterval(() => {
      state.recordTimer++;
      updateRecordTimer(state.recordTimer);
    }, 1000);
  } catch (error) {
    console.error("Error starting recording:", error);
    alert("Gagal mengakses microphone");
  }
}

function stopRecording(cancel = false) {
  if (!state.isRecording) return;
  
  state.isRecording = false;
  state.mediaRecorder.stop();
  clearInterval(timerInterval);

  updateRecordingUI(false);

  if (cancel) {
    state.audioChunks = [];
    return;
  }

  state.mediaRecorder.onstop = () => {
    const audioBlob = new Blob(state.audioChunks, { type: "audio/webm" });
    uploadVoiceBlob(audioBlob);
  };
}

async function uploadVoiceBlob(blob) {
  const formData = new FormData();
  formData.append("file", blob, "voice.webm");

  if (state.currentContext.type === "room") {
    formData.append("roomId", state.currentContext.roomId);
  }
  if (state.currentContext.type === "private") {
    formData.append("recipientId", state.currentContext.userId);
  }

  try {
    const res = await fetch("/api/upload/voice", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    if (!data.fileUrl) {
      console.error("Voice upload failed:", data);
    }
  } catch (error) {
    console.error("Voice upload error:", error);
  }
}

function finishRecording() {
  stopRecording(false);
}

// ==================== CLEAR CHAT ====================
async function clearChat() {
  if (!state.currentContext.type) return;

  if (!confirm("Bersihkan chat hanya untuk Anda? Hanya pesan yang Anda kirim yang akan dihapus, pesan lawan bicara tetap ada.")) {
    return;
  }

  let url = "";
  if (state.currentContext.type === "global") {
    url = `/api/chat/clear/global`;
  } else if (state.currentContext.type === "room") {
    url = `/api/chat/clear/room/${state.currentContext.roomId}`;
  } else if (state.currentContext.type === "private") {
    url = `/api/chat/clear/private/${state.currentContext.userId}`;
  }

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });

    const result = await res.json();
    console.log("Clear chat result:", result);

    if (result.success) {
      clearMessages();
      const successMsg = document.createElement("div");
      successMsg.className = "system-message success";
      successMsg.textContent = `✅ Berhasil menghapus ${result.deletedCount || 0} pesan (hanya untuk Anda)`;
      if (elements.messagesEl) elements.messagesEl.appendChild(successMsg);
      
      setTimeout(() => {
        setContext(state.currentContext);
      }, 500);
    } else {
      alert("❌ Gagal membersihkan chat");
    }
  } catch (err) {
    console.error("Clear chat error:", err);
    alert("❌ Terjadi error saat membersihkan chat");
  }
}

// ==================== WEBSOCKET ====================
function connectWS() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}${WS_PATH}?token=${token}`;

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    console.log("✅ WS Connected!");
    if (state.currentContext.type === "room") {
      state.ws.send(JSON.stringify({ 
        type: "join_room", 
        roomId: state.currentContext.roomId 
      }));
    }
  };

  state.ws.onmessage = (ev) => {
    let data;
    try { 
      data = JSON.parse(ev.data); 
    } catch (e) { 
      console.error("Failed to parse WS message:", ev.data);
      return; 
    }
    handleWS(data);
  };

  state.ws.onclose = () => {
    console.log("🔌 WS Disconnected");
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(connectWS, 2500);
  };

  state.ws.onerror = (e) => console.error("WebSocket error", e);
}

function handleWS(data) {
  console.log('📨 WS MESSAGE:', data.type, data);

  switch (data.type) {
    case "init":
      if (data.rooms) renderRooms(data.rooms, setContext);
      // Tidak render users di sini karena sekarang pakai contacts
      break;

    case "room_created":
      loadInit();
      break;

    case "global_message":
      if (state.currentContext.type === "global") {
        renderMessage(data.message);
      }
      break;

    case "room_message":
      if (data.message && shouldShowMessageForContext(data.message)) {
        renderMessage(data.message);
      }
      break;

    case "private_message":
      if (data.message && shouldShowMessageForContext(data.message)) {
        data.message.username = data.message.username || 
          (data.message.sender_id === myId ? myUsername : state.currentContext.username);
        renderMessage(data.message);
      }
      break;

    case "file_message":
      if (data.message && shouldShowMessageForContext(data.message)) {
        data.message.username = data.message.username || 
          (data.message.sender_id === myId ? myUsername : state.currentContext.username);
        renderMessage(data.message);
      }
      break;

    case "user_status":
      updateUserStatus(data.userId, data.isOnline);
      break;

    case "user_online":
    case "user_offline": {
      const uid = data.user?.id ?? data.userId;
      const isOnline = (data.type === 'user_online');
      if (uid && uid !== myId) {
        updateUserStatus(uid, isOnline);
      }
      break;
    }

    // Contact related messages
    case "contact_request":
      console.log('📨 New contact request from:', data.fromUsername);
      // Show notification
      if (Notification.permission === "granted") {
        new Notification("New Contact Request", {
          body: `${data.fromUsername} wants to add you as a contact`,
          icon: "/favicon.ico"
        });
      }
      
      // Update pending requests
      loadPendingRequests();
      
      // Show alert
      alert(`New contact request from ${data.fromUsername}`);
      break;
      
    case "contact_accepted":
      console.log('✅ Contact request accepted by:', data.byUsername);
      // Reload contacts
      loadContacts();
      
      // Show notification
      if (Notification.permission === "granted") {
        new Notification("Contact Request Accepted", {
          body: `${data.byUsername} accepted your contact request`,
          icon: "/favicon.ico"
        });
      }
      
      alert(`${data.byUsername} accepted your contact request`);
      break;

    // Call related messages
    case "call_offer":
      handleIncomingCall(data);
      break;
      
    case "call_answer":
      handleCallAnswer(data);
      break;
      
    case "ice_candidate":
      handleICECandidate(data);
      break;
      
    case "call_end":
      alert("Panggilan berakhir");
      cleanupCall();
      break;
      
    case "call_rejected":
      alert("Panggilan ditolak");
      cleanupCall();
      break;
      
    case "call_failed":
      alert("Panggilan gagal: " + (data.reason || "Unknown"));
      cleanupCall();
      break;

    default:
      console.log('❓ Unknown WS type:', data.type);
      break;
  }
}

// ==================== VOICE CALL FUNCTIONS ====================
async function startCall(targetUserId) {
  console.log('📞 Starting call to:', targetUserId);
  
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    alert("Tidak terhubung ke server");
    return;
  }

  if (state.currentCallId) {
    alert("Sedang dalam panggilan");
    return;
  }

  try {
    // Get microphone access
    state.localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true, 
        autoGainControl: true
      },
      video: false 
    });
    
    // Setup peer connection
    state.peerConnection = new RTCPeerConnection(servers);
    
    // Add local stream
    state.localStream.getTracks().forEach(track => {
      state.peerConnection.addTrack(track, state.localStream);
    });

    // Handle remote stream
    state.peerConnection.ontrack = (event) => {
      console.log('✅ Received remote stream');
      state.remoteStream = event.streams[0];
      if (elements.remoteAudio) {
        elements.remoteAudio.srcObject = state.remoteStream;
        elements.remoteAudio.play().catch(e => console.log('Audio play error:', e));
      }
    };

    // Handle ICE candidates
    state.peerConnection.onicecandidate = (event) => {
      if (event.candidate && state.currentCallId) {
        state.ws.send(JSON.stringify({
          type: "ice_candidate",
          candidate: event.candidate,
          callId: state.currentCallId,
          targetUserId: targetUserId
        }));
      }
    };

    // Create offer
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);

    // Generate call ID
    state.currentCallId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    window.currentCalleeId = targetUserId;

    // Send offer
    state.ws.send(JSON.stringify({
      type: "call_offer",
      targetUserId: targetUserId,
      offer: offer,
      callId: state.currentCallId
    }));

    // Show UI
    showCallUI("Memanggil...", true);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (state.currentCallId && state.peerConnection.connectionState !== 'connected') {
        alert("Panggilan tidak dijawab");
        endCall();
      }
    }, 30000);

  } catch (error) {
    console.error("Error starting call:", error);
    alert("Gagal memulai panggilan: " + error.message);
    cleanupCall();
  }
}

async function answerCall() {
  if (!state.currentCallId) {
    console.log('❌ No active call to answer');
    return;
  }

  try {
    // Get microphone access
    state.localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }, 
      video: false 
    });
    
    // Setup peer connection
    state.peerConnection = new RTCPeerConnection(servers);
    
    // Add local stream
    state.localStream.getTracks().forEach(track => {
      state.peerConnection.addTrack(track, state.localStream);
    });

    // Handle remote stream
    state.peerConnection.ontrack = (event) => {
      console.log('✅ Received remote stream');
      state.remoteStream = event.streams[0];
      if (elements.remoteAudio) {
        elements.remoteAudio.srcObject = state.remoteStream;
        elements.remoteAudio.play().catch(e => console.log('Audio play error:', e));
      }
    };

    // Handle ICE candidates
    state.peerConnection.onicecandidate = (event) => {
      if (event.candidate && state.currentCallId) {
        state.ws.send(JSON.stringify({
          type: "ice_candidate",
          candidate: event.candidate,
          callId: state.currentCallId,
          targetUserId: window.currentCallerId
        }));
      }
    };

    // Set remote description and create answer
    if (window.pendingOffer && window.pendingCallId === state.currentCallId) {
      await state.peerConnection.setRemoteDescription(window.pendingOffer);
      
      const answer = await state.peerConnection.createAnswer();
      await state.peerConnection.setLocalDescription(answer);

      state.ws.send(JSON.stringify({
        type: "call_answer",
        callId: state.currentCallId,
        answer: answer
      }));

      showCallUI("Sedang Berbicara...", false);
      console.log('✅ Call answered');
    } else {
      console.log('❌ No pending offer');
      endCall();
    }

  } catch (error) {
    console.error("Error answering call:", error);
    alert("Gagal menjawab panggilan");
    endCall();
  }
}

function rejectCall() {
  if (state.currentCallId) {
    state.ws.send(JSON.stringify({
      type: "call_reject",
      callId: state.currentCallId
    }));
  }
  cleanupCall();
}

function endCall() {
  if (state.currentCallId) {
    state.ws.send(JSON.stringify({
      type: "call_end",
      callId: state.currentCallId
    }));
  }
  cleanupCall();
}

function cleanupCall() {
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }
  
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  
  state.currentCallId = null;
  state.remoteStream = null;
  
  hideCallUI();
}

async function handleIncomingCall(data) {
  console.log('📞 Incoming call from:', data.callerName);
  
  if (state.currentCallId) {
    console.log('❌ Busy, rejecting');
    state.ws.send(JSON.stringify({
      type: "call_reject", 
      callId: data.callId
    }));
    return;
  }

  state.currentCallId = data.callId;
  window.pendingOffer = data.offer;
  window.pendingCallId = data.callId;
  window.currentCallerId = data.callerId;
  
  setCallerName(data.callerName);
  showCallUI("Panggilan Masuk...", false);
}

async function handleCallAnswer(data) {
  console.log('📞 Call answered:', data.callId);
  
  if (state.peerConnection && state.currentCallId === data.callId) {
    try {
      await state.peerConnection.setRemoteDescription(data.answer);
      console.log('✅ Remote description set');
    } catch (error) {
      console.error('Error setting remote description:', error);
      endCall();
    }
  }
}

async function handleICECandidate(data) {
  if (state.peerConnection && state.currentCallId === data.callId) {
    await state.peerConnection.addIceCandidate(data.candidate);
  }
}

// ==================== STATUS CHECKER ====================
function startStatusChecker() {
  setInterval(async () => {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    
    try {
      const res = await fetch(API_ROOT + "/init", {
        headers: { Authorization: "Bearer " + token },
      });
      const data = await res.json();
      
      // Update contacts status
      if (state.userList && data.users) {
        data.users.forEach(newUser => {
          const oldUser = state.userList.find(u => u.id === newUser.id);
          if (oldUser && oldUser.is_online !== newUser.is_online) {
            updateUserStatus(newUser.id, newUser.is_online);
          }
        });
      }
      
    } catch (error) {
      console.error('Status check error:', error);
    }
  }, 30000);
}

// ==================== INITIALIZATION ====================
async function init() {
  document.addEventListener("DOMContentLoaded", async () => {
    console.log('🚀 Initializing chat...');

    initUI();
    setupEventListenerss();   // ✅ sekarang AMAN

    updateClearBtnVisibility();

    await loadInit();
    await loadPendingRequests();

    connectWS();
    startStatusChecker();

    console.log('✅ Chat initialized');
  });
  
  // Expose functions to window for UI access
  window.setContext = setContext;
  window.startCall = startCall;
  window.loadContacts = loadContacts;
  window.loadPendingRequests = loadPendingRequests;
  window.showAddContactModal = showAddContactModal;
  window.closeAddContactModal = closeAddContactModal;
  window.sendContactRequest = sendContactRequest;
  window.acceptContactRequest = acceptContactRequest;
  window.rejectContactRequest = rejectContactRequest;
  window.removeContact = removeContact;
  window.sendMessage = sendMessage;
  window.createRoom = createRoom;
  window.logout = logout;
  window.uploadFile = uploadFile;
  window.startRecording = startRecording;
  window.finishRecording = finishRecording;
  window.stopRecording = stopRecording;
  window.clearChat = clearChat;
  window.answerCall = answerCall;
  window.rejectCall = rejectCall;
  window.endCall = endCall;
  window.searchUsers = searchUsers;
  window.debugModalClose = debugModalClose;
  window.debugAllButtons = debugAllButtons;
  
  console.log('✅ Chat initialized');
}

// Start everything
init();