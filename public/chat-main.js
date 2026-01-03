import { 
  API_ROOT, WS_PATH, token, myId, myUsername,
  state, servers, authHeaders 
} from './chat-config.js';

import {
  elements,
  initUI, setupEventListenerss, clearMessages, renderMessage,
  shouldShowMessageForContext, renderRooms, renderContacts,
  renderPendingRequests, renderSearchResults,
  updateUserStatus, updateChatTitle, updateClearBtnVisibility,
  updateRecordingUI, updateRecordTimer, showCallUI, hideCallUI,
  setCallerName, showAddContactModal, closeAddContactModal, updatePendingBadge
} from './chat-ui.js';

// Hapus fitur clearedContexts yang kompleks
state.clearedContexts = {};

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

// System untuk polling file messages
state.messagePollers = {};

// Fungsi untuk start polling setelah upload
function startMessagePolling(context, fileUrl, timeout = 10000) {
  const pollerId = `poller_${Date.now()}`;
  let attempts = 0;
  const maxAttempts = timeout / 1000; // 10 detik
  
  console.log(`🔄 Starting message polling for: ${fileUrl}`);
  
  const poller = setInterval(async () => {
    attempts++;
    
    if (attempts > maxAttempts) {
      console.log(`⏰ Polling timeout for: ${fileUrl}`);
      clearInterval(poller);
      delete state.messagePollers[pollerId];
      return;
    }
    
    try {
      const message = await fetchMessageByFileUrl(context, fileUrl);
      
      if (message) {
        console.log(`✅ Found uploaded message via polling:`, message);
        
        // Hapus temporary message
        const tempElements = document.querySelectorAll('[id^="message-temp_"]');
        tempElements.forEach(el => el.remove());
        
        // Render real message
        renderMessage(message);
        
        // Stop polling
        clearInterval(poller);
        delete state.messagePollers[pollerId];
      }
    } catch (error) {
      console.log(`Polling attempt ${attempts} failed:`, error.message);
    }
  }, 1000);
  
  state.messagePollers[pollerId] = poller;
  
  // Auto cleanup setelah timeout
  setTimeout(() => {
    if (state.messagePollers[pollerId]) {
      clearInterval(state.messagePollers[pollerId]);
      delete state.messagePollers[pollerId];
      console.log(`🧹 Cleaned up poller ${pollerId}`);
    }
  }, timeout + 5000);
}

// Fungsi untuk mencari message berdasarkan fileUrl
async function fetchMessageByFileUrl(context, fileUrl) {
  try {
    let endpoint = '';
    
    if (context.type === 'private') {
      // Untuk private chat, coba endpoint conversations
      endpoint = `${API_ROOT}/private/conversation/${myId}/${context.userId}?fileUrl=${encodeURIComponent(fileUrl)}`;
    } else if (context.type === 'room') {
      endpoint = `${API_ROOT}/rooms/${context.roomId}/messages?fileUrl=${encodeURIComponent(fileUrl)}`;
    } else {
      endpoint = `${API_ROOT}/messages/global?fileUrl=${encodeURIComponent(fileUrl)}`;
    }
    
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      return data.message || data.messages?.[0];
    }
  } catch (error) {
    console.error('Error fetching message by fileUrl:', error);
  }
  
  return null;
}

// Fungsi untuk cek semua messages baru
async function checkForNewMessages(context) {
  try {
    let endpoint = '';
    let lastMessageId = getLastMessageId();
    
    if (context.type === 'private') {
      endpoint = `${API_ROOT}/private/${myId}/${context.userId}/new?since=${lastMessageId || ''}`;
    } else if (context.type === 'room') {
      endpoint = `${API_ROOT}/rooms/${context.roomId}/messages/new?since=${lastMessageId || ''}`;
    } else {
      endpoint = `${API_ROOT}/messages/global/new?since=${lastMessageId || ''}`;
    }
    
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      const newMessages = data.messages || [];
      
      newMessages.forEach(msg => {
        // Cek apakah message sudah ada di UI
        const existing = document.getElementById(`message-${msg.id}`);
        if (!existing) {
          renderMessage(msg);
        }
      });
      
      // Update last message ID
      if (newMessages.length > 0) {
        updateLastMessageId(newMessages[newMessages.length - 1].id);
      }
    }
  } catch (error) {
    console.error('Error checking new messages:', error);
  }
}

// Helper functions
function getLastMessageId() {
  const messages = document.querySelectorAll('.message');
  if (messages.length === 0) return null;
  
  const lastMessage = messages[messages.length - 1];
  const id = lastMessage.id.replace('message-', '');
  return id.startsWith('temp_') ? null : id;
}

function updateLastMessageId(id) {
  // Simpan di localStorage atau state
  if (state.currentContext) {
    const key = `lastMsg_${state.currentContext.type}_${state.currentContext.userId || state.currentContext.roomId || 'global'}`;
    localStorage.setItem(key, id);
  }
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

export async function loadPendingRequests() {
  try {
    console.log('🔄 Memuat pending requests...');
    
    const res = await fetch(`${API_ROOT}/contacts/pending`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) throw new Error('Gagal memuat requests');
    
    const data = await res.json();
    console.log('📨 Data dari API:', data);
    
    let requests = [];
    
    if (data.pending && Array.isArray(data.pending)) {
      requests = data.pending;
    } 
    else if (Array.isArray(data)) {
      requests = data;
    }
    
    state.pendingRequests = requests;
    renderPendingRequests(requests);
    
    // Update badge
    updatePendingBadge(requests.length);
    
    console.log(`✅ Selesai: ${requests.length} pending requests dimuat`);
    return requests;
  } catch (error) {
    console.error('Error loading requests:', error);
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
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    console.log('📦 Loaded init data:', data);

    renderRooms(data.rooms || [], setContext);
    
    if (data.contacts) {
      state.userList = data.contacts;
      renderContacts(data.contacts, setContext, startCall);
    } else {
      await loadContacts();
    }
    
    if (data.pendingCount !== undefined) {
      updatePendingBadge(data.pendingCount);
    }

    // Load messages based on current context
    loadMessagesForCurrentContext();
    
  } catch (error) {
    console.error('Error loading init:', error);
    alert('Gagal memuat data awal');
  }
}

// Fungsi untuk memuat pesan berdasarkan konteks saat ini - DIKOREKSI
async function loadMessagesForCurrentContext() {
  if (!state.currentContext) return;
  
  const ctx = state.currentContext;
  clearMessages();
  
  try {
    if (ctx.type === "global") {
      updateChatTitle("Global", "Public global chat");
      
      // Load dari init - server sudah filter berdasarkan user_chat_clears
      const res = await fetch(API_ROOT + "/init", {
        headers: { Authorization: "Bearer " + token },
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      const globalMessages = (data.messages || []).filter(m => 
        !m.room_id && !m.recipient_id
      );
      
      globalMessages.forEach(m => {
        m.username = `Global — ${m.username || m.sender_username}`;
        renderMessage(m);
      });
      
      if (globalMessages.length === 0) {
        showEmptyMessage("global", "No messages in global chat yet");
      }
      
    } else if (ctx.type === "room") {
      updateChatTitle(ctx.name, "Room chat");
      
      // Endpoint room sudah filter berdasarkan user_chat_clears
      const res = await fetch(
        `${API_ROOT}/rooms/${ctx.roomId}/messages`,
        { headers: { Authorization: "Bearer " + token } }
      );
      
      if (res.ok) {
        const data = await res.json();
        (data.messages || []).forEach(renderMessage);
        
        if (data.messages?.length === 0) {
          showEmptyMessage("room", "No messages in this room yet");
        }
      }
      
    } else if (ctx.type === "private") {
      const cleanUsername = ctx.username ? ctx.username.trim() : '';
      updateChatTitle("Private — " + cleanUsername, "Direct message");
      
      // Endpoint private sudah filter berdasarkan user_chat_clears
      const endpoint = `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(cleanUsername)}`;
      const res = await fetch(endpoint, { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      });
      
      if (res.ok) {
        const data = await res.json();
        (data.messages || []).forEach(m => {
          if (!m.username) {
            m.username = m.sender_id === myId ? myUsername : cleanUsername;
          }
          renderMessage(m);
        });
        
        if (data.messages?.length === 0) {
          showEmptyMessage("private", `No messages yet with ${cleanUsername}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error loading messages:', error);
    showErrorMessage("Failed to load messages: " + error.message);
  }
  
  updateClearBtnVisibility();
}

// Tambahkan fungsi helper di chat-main.js
function showEmptyMessage(type, text) {
  const emptyMsg = document.createElement("div");
  emptyMsg.className = "system-message info text-center py-8 text-slate-400 text-sm";
  
  let icon = "💬";
  if (type === "global") icon = "🌍";
  else if (type === "room") icon = "👥";
  
  emptyMsg.innerHTML = `
    <div class="mb-2">${icon}</div>
    <div>${text}</div>
    <div class="text-xs mt-1 text-slate-500">Send a message to start the conversation</div>
  `;
  
  if (elements.messagesEl) elements.messagesEl.appendChild(emptyMsg);
}

function showErrorMessage(text) {
  const errorMsg = document.createElement("div");
  errorMsg.className = "system-message error p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-3";
  errorMsg.innerHTML = `
    <div class="font-medium">Error Loading Messages</div>
    <div class="text-sm mt-1">${text}</div>
  `;
  
  if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
}

async function setContext(ctx) {
  console.log('🔄 Setting context:', ctx);
  
  state.currentContext = ctx;
  await loadMessagesForCurrentContext();
}

function handlePrivateChatError(error, username) {
  clearMessages();
  
  const errorMsg = document.createElement("div");
  errorMsg.className = "system-message error p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-3";
  
  if (error.message.includes('404')) {
    errorMsg.innerHTML = `
      <div class="font-medium">Cannot Start Chat</div>
      <div class="text-sm mt-1">Unable to load conversation with ${username}.</div>
    `;
  } else {
    errorMsg.innerHTML = `
      <div class="font-medium">Error Loading Messages</div>
      <div class="text-sm mt-1">${error.message}</div>
    `;
  }
  
  if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
}

async function sendMessage() {
  if (!elements.msgInputEl) return;
  
  const txt = elements.msgInputEl.value.trim();
  if (!txt) return;
  
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    alert("Tidak terhubung ke server");
    return;
  }

  // Simpan text sebelum clear
  const messageContent = txt;
  
  // Clear input dulu
  elements.msgInputEl.value = "";
  
  // Kirim via WebSocket berdasarkan konteks
  if (state.currentContext.type === "global") {
    state.ws.send(JSON.stringify({ 
      type: "global_message", 
      content: messageContent 
    }));
  } else if (state.currentContext.type === "room") {
    state.ws.send(JSON.stringify({ 
      type: "room_message", 
      roomId: state.currentContext.roomId, 
      content: messageContent 
    }));
  } else if (state.currentContext.type === "private") {
    state.ws.send(JSON.stringify({
      type: "private_message",
      recipientId: state.currentContext.userId,
      recipientUsername: state.currentContext.username,
      content: messageContent
    }));
  }
  
  // TIDAK LAGI PAKAI OPTIMISTIC UPDATE
  // Biarkan server yang mengirim kembali via WebSocket
  
  console.log('📤 Message sent via WebSocket');
}

async function uploadFile(file) {
  console.log('📸 Uploading file:', file.name, file.type);
  
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

  const context = state.currentContext;
  
  // Tambahkan data konteks
  formData.append("sender_id", myId);
  formData.append("sender_username", myUsername);
  formData.append("content", fileType === "image" ? "Sent an image" : "Sent a voice message");
  
  if (context.type === "room") {
    formData.append("roomId", context.roomId);
    formData.append("type", "room");
  } else if (context.type === "private") {
    formData.append("recipientId", context.userId);
    formData.append("recipientUsername", context.username);
    formData.append("type", "private");
  } else {
    formData.append("type", "global");
  }

  // Temporary preview
  const tempObjectUrl = URL.createObjectURL(file);
  const tempMsg = {
    id: `temp_${fileType}_${Date.now()}`,
    sender_id: myId,
    username: myUsername,
    file_type: fileType,
    file_url: tempObjectUrl,
    content: fileType === "image" ? "Sending image..." : "Sending voice...",
    created_at: new Date().toISOString(),
    is_temp: true
  };
  
  renderMessage(tempMsg);

  try {
    // Upload file
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    console.log(`✅ ${fileType} upload successful:`, data);
    
    // Revoke temporary URL
    URL.revokeObjectURL(tempObjectUrl);
    
    // **SOLUSI PENTING**: Start polling untuk message baru
    if (data.fileUrl) {
      startMessagePolling(context, data.fileUrl);
    }
    
    // **Juga kirim manual polling untuk penerima**
    if (context.type === "private" && state.ws && state.ws.readyState === WebSocket.OPEN) {
      // Kirim notification ke penerima untuk check messages baru
      state.ws.send(JSON.stringify({
        type: "check_new_messages",
        recipientId: context.userId,
        fileUrl: data.fileUrl,
        timestamp: Date.now()
      }));
    }
    
  } catch (error) {
    console.error(`❌ ${fileType} upload error:`, error);
    
    // Update temporary message menjadi error
    const errorElement = document.getElementById(`message-temp_${fileType}_${Date.now()}`);
    if (errorElement) {
      errorElement.innerHTML = `
        <div class="text-red-600 italic">
          ❌ Failed to send ${fileType}: ${error.message}
        </div>
      `;
    }
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
    console.log('🎤 Starting recording...');
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    state.mediaRecorder = new MediaRecorder(stream);
    state.audioChunks = [];
    
    state.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        state.audioChunks.push(e.data);
      }
    };
    
    state.mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      
      if (!state.recordingCancelled && state.audioChunks.length > 0) {
        const audioBlob = new Blob(state.audioChunks, { type: "audio/webm" });
        await uploadVoiceBlob(audioBlob);
      }
      
      state.audioChunks = [];
      state.recordingCancelled = false;
    };
    
    state.mediaRecorder.start();
    state.isRecording = true;
    state.recordTimer = 0;

    updateRecordingUI(true);
    
    timerInterval = setInterval(() => {
      state.recordTimer++;
      updateRecordTimer(state.recordTimer);
      
      if (state.recordTimer >= 120) {
        finishRecording();
      }
    }, 1000);
    
  } catch (error) {
    console.error("Error starting recording:", error);
    alert("Cannot access microphone. Please check permissions.");
    stopRecording(true);
  }
}

function stopRecording(cancel = false) {
  if (!state.isRecording) return;
  
  state.isRecording = false;
  state.recordingCancelled = cancel;
  
  updateRecordingUI(false);
  clearInterval(timerInterval);
  
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  
  if (cancel) {
    state.audioChunks = [];
  }
}

async function uploadVoiceBlob(blob) {
  console.log('🎤 Uploading voice blob...');
  
  const context = state.currentContext;
  const formData = new FormData();
  formData.append("file", blob, "voice.webm");
  formData.append("sender_id", myId);
  formData.append("sender_username", myUsername);
  formData.append("content", "Voice message");

  // **PERBAIKAN**: Tambahkan semua data untuk broadcasting
  if (context.type === "room") {
    formData.append("roomId", context.roomId);
    formData.append("type", "room");
  } else if (context.type === "private") {
    formData.append("recipientId", context.userId);
    formData.append("recipientUsername", context.username);
    formData.append("type", "private");
  } else {
    formData.append("type", "global");
  }

  try {
    // Upload voice
    const res = await fetch("/api/upload/voice", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    console.log('✅ Voice upload successful:', data);
    
    // **PERBAIKAN**: Tampilkan temporary message
    const tempMsg = {
      id: `temp_voice_${Date.now()}`,
      sender_id: myId,
      username: myUsername,
      file_type: "voice",
      file_url: URL.createObjectURL(blob),
      content: "Voice message sent",
      created_at: new Date().toISOString(),
      is_temp: true
    };
    
    renderMessage(tempMsg);
    
    // Hapus temporary message setelah beberapa saat
    setTimeout(() => {
      const tempElement = document.getElementById(`message-temp_voice_${Date.now()}`);
      if (tempElement) {
        tempElement.remove();
      }
    }, 2000);
    
    // **ATAU**: Kirim WebSocket notification
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      const wsMessage = {
        type: "voice_uploaded",
        fileUrl: data.fileUrl,
        context: context,
        senderId: myId,
        senderUsername: myUsername
      };
      
      state.ws.send(JSON.stringify(wsMessage));
    }
    
  } catch (error) {
    console.error("❌ Voice upload error:", error);
    alert("Failed to send voice message: " + error.message);
  }
}

function finishRecording() {
  console.log('🔄 Finishing recording...');
  stopRecording(false);
}

// ==================== CLEAR CHAT (SIMPLIFIED) ====================
async function clearChat() {
  if (!state.currentContext.type) return;

  // PERBAIKAN: Konfirmasi yang benar
  const confirmed = confirm(
    "Bersihkan chat?\n\n" +
    "Chat akan dihapus HANYA untuk Anda.\n" +
    "Pesan akan HILANG dari tampilan Anda dan TIDAK AKAN MUNCUL kembali setelah refresh.\n" +
    "Pesan masih akan terlihat oleh pengguna lain.\n\n" +
    "Lanjutkan?"
  );
  
  if (!confirmed) return;

  const context = state.currentContext;
  let url = "";
  let contextName = "";
  
  if (context.type === "global") {
    url = `/api/chat/clear/global`;
    contextName = "Global";
  } else if (context.type === "room") {
    url = `/api/chat/clear/room/${context.roomId}`;
    contextName = context.name;
  } else if (context.type === "private") {
    url = `/api/chat/clear/private/${context.userId}`;
    contextName = context.username;
  }

  console.log('🧹 Clearing chat:', contextName, 'URL:', url);

  try {
    // Tampilkan loading
    clearMessages();
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "system-message loading text-center p-4 bg-blue-50 border border-blue-200 rounded-xl mb-3";
    loadingMsg.innerHTML = `
      <div class="text-blue-700 font-medium mb-1">⏳ Membersihkan chat ${contextName}...</div>
      <div class="text-sm text-blue-600">Menghapus chat hanya untuk Anda</div>
    `;
    if (elements.messagesEl) elements.messagesEl.appendChild(loadingMsg);

    // Kirim request ke server
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });

    const result = await res.json();
    console.log("Clear chat result:", result);

    // Hapus loading
    if (loadingMsg.parentNode) {
      loadingMsg.parentNode.removeChild(loadingMsg);
    }

    if (result.success) {
      // PERBAIKAN: Tampilkan pesan yang BENAR
      const successMsg = document.createElement("div");
      successMsg.className = "system-message success text-center p-4 bg-green-50 border border-green-200 rounded-xl mb-3";
      successMsg.innerHTML = `
        <div class="text-green-700 font-medium mb-1">✅ Chat ${contextName} Telah Dihapus</div>
        <div class="text-sm text-green-600">
          Chat telah dihapus dari tampilan Anda
        </div>
        <div class="text-xs text-green-500 mt-2">
          Chat TIDAK AKAN muncul kembali setelah refresh<br>
          (Hanya untuk akun Anda, pengguna lain masih bisa melihat)
        </div>
      `;
      if (elements.messagesEl) elements.messagesEl.appendChild(successMsg);
      
      console.log('✅ Chat cleared successfully');
      
      // Hapus semua message dari UI
      const allMessages = document.querySelectorAll('.message:not(.system-message)');
      allMessages.forEach(msg => msg.remove());
      
    } else {
      const errorMsg = document.createElement("div");
      errorMsg.className = "system-message error text-center p-4 bg-red-50 border border-red-200 rounded-xl mb-3";
      errorMsg.innerHTML = `
        <div class="text-red-700 font-medium mb-1">❌ Gagal Membersihkan Chat</div>
        <div class="text-sm text-red-600">${result.error || "Unknown error"}</div>
      `;
      if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
      
      // Reload messages
      setTimeout(() => loadMessagesForCurrentContext(), 1000);
    }
  } catch (err) {
    console.error("Clear chat error:", err);
    
    const errorMsg = document.createElement("div");
    errorMsg.className = "system-message error text-center p-4 bg-red-50 border border-red-200 rounded-xl mb-3";
    errorMsg.innerHTML = `
      <div class="text-red-700 font-medium mb-1">❌ Error</div>
      <div class="text-sm text-red-600">Terjadi error saat membersihkan chat</div>
    `;
    if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
  }
}

function loadClearedChats() {
  try {
    // Load dari localStorage
    const saved = localStorage.getItem('clearedChats');
    if (saved) {
      state.clearedChats = JSON.parse(saved);
      console.log('📁 Loaded cleared chats:', Object.keys(state.clearedChats).length);
    }
    
    // Load dari sessionStorage (backup)
    if (!state.clearedChats) state.clearedChats = {};
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith('cleared_')) {
        const contextKey = key.replace('cleared_', '');
        const timestamp = parseInt(sessionStorage.getItem(key));
        if (timestamp && (!state.clearedChats[contextKey] || timestamp > state.clearedChats[contextKey])) {
          state.clearedChats[contextKey] = timestamp;
        }
      }
    });
  } catch (e) {
    console.warn('Error loading cleared chats:', e);
    state.clearedChats = {};
  }
}

// Fungsi untuk verifikasi clear chat
async function verifyChatCleared() {
  if (!state.currentContext) return;
  
  console.log('🔍 Verifying chat is cleared...');
  
  try {
    let endpoint = "";
    
    if (state.currentContext.type === "global") {
      endpoint = `${API_ROOT}/messages/global/count`;
    } else if (state.currentContext.type === "room") {
      endpoint = `${API_ROOT}/rooms/${state.currentContext.roomId}/messages/count`;
    } else if (state.currentContext.type === "private") {
      endpoint = `${API_ROOT}/private/${myId}/${state.currentContext.userId}/count`;
    }
    
    const res = await fetch(endpoint, {
      headers: { Authorization: "Bearer " + token }
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log(`📊 Message count after clear: ${data.count}`);
      
      if (data.count > 0) {
        console.warn(`⚠️ Masih ada ${data.count} pesan di database!`);
        return false;
      }
      
      return true;
    }
  } catch (error) {
    console.error('Verification error:', error);
  }
  
  return false;
}

// Ekspos ke window
window.verifyChatCleared = verifyChatCleared;

// ==================== WEBSOCKET (IMPROVED) ====================
function connectWS() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}${WS_PATH}?token=${token}`;

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    console.log("✅ WS Connected!");
    
    // Join room jika di room context
    if (state.currentContext.type === "room") {
      state.ws.send(JSON.stringify({ 
        type: "join_room", 
        roomId: state.currentContext.roomId 
      }));
    }
    
    // Subscribe ke private chat jika di private context
    if (state.currentContext.type === "private") {
      state.ws.send(JSON.stringify({
        type: "subscribe_private",
        userId: state.currentContext.userId
      }));
    }
  };

  state.ws.onmessage = (ev) => {
    let data;
    try { 
      data = JSON.parse(ev.data); 
      console.log('📨 WS Received:', data.type);
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
      break;

    case "room_created":
      loadInit();
      break;

    case "global_message":
      console.log('🌍 Global message received');
      if (state.currentContext.type === "global") {
        renderMessage(data.message);
      }
      break;

    case "room_message":
      console.log('👥 Room message received');
      if (state.currentContext.type === "room" && 
          Number(state.currentContext.roomId) === Number(data.message.room_id)) {
        renderMessage(data.message);
      }
      break;

    case "private_message":
      console.log('🔒 Private message received:', data.message);
      
      // Debug detail
      console.log('Private message debug:', {
        sender_id: data.message.sender_id,
        recipient_id: data.message.recipient_id,
        myId: myId,
        currentContext: state.currentContext
      });
      
      // SEDERHANAKAN: Tampilkan jika sedang di chat yang relevan
      if (state.currentContext.type === "private") {
        const msgSenderId = Number(data.message.sender_id);
        const msgRecipientId = Number(data.message.recipient_id);
        const currentUserId = Number(state.currentContext.userId);
        const myIdNum = Number(myId);
        
        const shouldShow = 
          (msgSenderId === myIdNum && msgRecipientId === currentUserId) ||
          (msgSenderId === currentUserId && msgRecipientId === myIdNum);
        
        if (shouldShow) {
          console.log('✅ Rendering private message');
          data.message.username = data.message.username || 
            (data.message.sender_id == myId ? myUsername : state.currentContext.username);
          renderMessage(data.message);
        } else {
          console.log('❌ Skipping private message - wrong context');
        }
      }
      break;

    case "file_message":
      console.log('📄 File message received:', data.message);
      
      // Sama seperti private_message
      if (state.currentContext.type === "private") {
        const msgSenderId = Number(data.message.sender_id);
        const msgRecipientId = Number(data.message.recipient_id);
        const currentUserId = Number(state.currentContext.userId);
        const myIdNum = Number(myId);
        
        const shouldShow = 
          (msgSenderId === myIdNum && msgRecipientId === currentUserId) ||
          (msgSenderId === currentUserId && msgRecipientId === myIdNum);
        
        if (shouldShow) {
          console.log('✅ Rendering file message');
          data.message.username = data.message.username || 
            (data.message.sender_id == myId ? myUsername : state.currentContext.username);
          renderMessage(data.message);
        }
      }
      break;
      
    case "file_uploaded":
    case "voice_uploaded":
      // **PERBAIKAN**: Handle direct file upload notifications
      console.log(`📤 ${data.type} notification:`, data);
      
      // Kirim request untuk get message yang baru saja diupload
      fetchNewFileMessage(data.fileUrl, data.context);
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

    case "contact_request":
      console.log('📨 New contact request from:', data.fromUsername);
      loadPendingRequests();
      
      if (Notification.permission === "granted") {
        new Notification("New Contact Request", {
          body: `${data.fromUsername} wants to add you as a contact`
        });
      }
      break;
      
    case "contact_accepted":
      console.log('✅ Contact request accepted by:', data.byUsername);
      loadContacts();
      
      if (Notification.permission === "granted") {
        new Notification("Contact Request Accepted", {
          body: `${data.byUsername} accepted your contact request`
        });
      }
      break;

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

      case "check_new_messages":
      // Jika saya adalah penerima, cek messages baru
      if (data.recipientId == myId) {
        console.log('🔔 Notification to check new messages');
        
        // Tunggu 1 detik lalu cek
        setTimeout(() => {
          if (state.currentContext && state.currentContext.userId == data.senderId) {
            checkForNewMessages(state.currentContext);
          }
        }, 1000);
      }
      break;
      
    case "force_refresh":
      // Force refresh chat
      if (state.currentContext) {
        console.log('🔄 Force refreshing chat...');
        loadMessagesForCurrentContext();
      }
      break;

    default:
      console.log('❓ Unknown WS type:', data.type);
      break;
  }
}

function checkFileMessageRelevance(message) {
  const context = state.currentContext;
  
  if (!context) return false;
  
  // Global file messages
  if (!message.room_id && !message.recipient_id && context.type === "global") {
    return true;
  }
  
  // Room file messages
  if (message.room_id && context.type === "room" && 
      message.room_id == context.roomId) {
    return true;
  }
  
  // Private file messages
  if (message.recipient_id && context.type === "private") {
    // Message untuk saya dari current user
    if (message.recipient_id == myId && message.sender_id == context.userId) {
      return true;
    }
    
    // Message dari saya ke current user
    if (message.sender_id == myId && message.recipient_id == context.userId) {
      return true;
    }
  }
  
  return false;
}

// **Fungsi baru**: Fetch file message setelah upload
async function fetchNewFileMessage(fileUrl, context) {
  try {
    let endpoint = "";
    
    if (context.type === "room") {
      endpoint = `${API_ROOT}/rooms/${context.roomId}/messages/latest`;
    } else if (context.type === "private") {
      endpoint = `${API_ROOT}/private/${myId}/${context.userId}/latest`;
    } else {
      endpoint = `${API_ROOT}/messages/global/latest`;
    }
    
    const res = await fetch(endpoint, {
      headers: { Authorization: "Bearer " + token }
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.message && data.message.file_url === fileUrl) {
        renderMessage(data.message);
      }
    }
  } catch (error) {
    console.error('Error fetching new file message:', error);
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
    state.localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true, 
        autoGainControl: true
      },
      video: false 
    });
    
    state.peerConnection = new RTCPeerConnection(servers);
    
    state.localStream.getTracks().forEach(track => {
      state.peerConnection.addTrack(track, state.localStream);
    });

    state.peerConnection.ontrack = (event) => {
      console.log('✅ Received remote stream');
      state.remoteStream = event.streams[0];
      if (elements.remoteAudio) {
        elements.remoteAudio.srcObject = state.remoteStream;
        elements.remoteAudio.play().catch(e => console.log('Audio play error:', e));
      }
    };

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

    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);

    state.currentCallId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    window.currentCalleeId = targetUserId;

    state.ws.send(JSON.stringify({
      type: "call_offer",
      targetUserId: targetUserId,
      offer: offer,
      callId: state.currentCallId
    }));

    showCallUI("Memanggil...", true);
    
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
    state.localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }, 
      video: false 
    });
    
    state.peerConnection = new RTCPeerConnection(servers);
    
    state.localStream.getTracks().forEach(track => {
      state.peerConnection.addTrack(track, state.localStream);
    });

    state.peerConnection.ontrack = (event) => {
      console.log('✅ Received remote stream');
      state.remoteStream = event.streams[0];
      if (elements.remoteAudio) {
        elements.remoteAudio.srcObject = state.remoteStream;
        elements.remoteAudio.play().catch(e => console.log('Audio play error:', e));
      }
    };

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

async function testEndpoints() {
  console.log('🔍 Testing endpoints...');
  
  const endpoints = [
    { name: 'Global from init', url: API_ROOT + "/init" },
    { name: 'Global messages', url: API_ROOT + "/messages/global" },
    { name: 'Global chat', url: API_ROOT + "/chat/global" },
    { name: 'Global', url: API_ROOT + "/global/messages" },
  ];
  
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url, {
        headers: { Authorization: "Bearer " + token },
      });
      
      console.log(`${endpoint.name} (${endpoint.url}): HTTP ${res.status}`);
      
      if (res.ok) {
        const data = await res.json();
        console.log(`✅ Works! Response keys:`, Object.keys(data));
        
        if (data.messages) {
          console.log(`   Found ${data.messages.length} messages`);
        }
        
        return endpoint.url; // Return endpoint yang berhasil
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name} failed:`, error.message);
    }
  }
  
  console.error('No working endpoint found!');
  return null;
}

// ==================== INITIALIZATION ====================
async function init() {
  document.addEventListener("DOMContentLoaded", async () => {
    console.log('🚀 Initializing chat...');

    // Load cleared chats
    loadClearedChats();

    initUI();
    setupEventListenerss();

    updateClearBtnVisibility();

    await loadInit();
    await loadPendingRequests();

    connectWS();
    startStatusChecker();
    
    // Start background polling untuk messages baru
    startBackgroundPolling();

    console.log('✅ Chat initialized');
  });
  
  // Expose functions to window
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
  window.updateRecordingUI = updateRecordingUI;
  window.updateRecordTimer = updateRecordTimer;
  window.clearChat = clearChat;
  window.answerCall = answerCall;
  window.rejectCall = rejectCall;
  window.endCall = endCall;
  window.searchUsers = searchUsers;
  
  console.log('✅ Chat initialized');
}

function startBackgroundPolling() {
  // Poll setiap 30 detik untuk messages baru
  setInterval(() => {
    if (state.currentContext && document.visibilityState === 'visible') {
      checkForNewMessages(state.currentContext);
    }
  }, 30000);
}
// Di akhir chat-main.js
window.debugMessages = async function() {
  console.log('🔍 Debug messages...');
  console.log('Current context:', state.currentContext);
  console.log('Cleared chats:', state.clearedChats);
  console.log('Active pollers:', Object.keys(state.messagePollers).length);
  
  // Cek messages di database
  if (state.currentContext) {
    const count = await getMessageCount(state.currentContext);
    console.log(`Messages in database: ${count}`);
  }
};

async function getMessageCount(context) {
  try {
    let endpoint = '';
    
    if (context.type === 'private') {
      endpoint = `${API_ROOT}/private/${myId}/${context.userId}/count`;
    } else if (context.type === 'room') {
      endpoint = `${API_ROOT}/rooms/${context.roomId}/messages/count`;
    } else {
      endpoint = `${API_ROOT}/messages/global/count`;
    }
    
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      const data = await res.json();
      return data.count || 0;
    }
  } catch (error) {
    console.error('Error getting message count:', error);
  }
  
  return 0;
}
// Fungsi debug untuk test realtime
window.debugRealtime = function() {
  console.log('🔍 DEBUG REAL-TIME:');
  console.log('1. WebSocket status:', {
    wsExists: !!state.ws,
    readyState: state.ws?.readyState,
    OPEN: WebSocket.OPEN,
    isConnected: state.ws?.readyState === WebSocket.OPEN
  });
  
  console.log('2. Current context:', state.currentContext);
  
  console.log('3. My info:', {
    myId: myId,
    myUsername: myUsername
  });
  
  console.log('4. Test sending message...');
  
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    // Send test message
    const testMsg = {
      type: "private_message",
      recipientId: state.currentContext.userId,
      content: `TEST: ${new Date().toLocaleTimeString()}`
    };
    
    state.ws.send(JSON.stringify(testMsg));
    console.log('📤 Test message sent:', testMsg);
    
    return true;
  } else {
    console.log('❌ WebSocket not connected');
    return false;
  }
};

// Test filter function
window.testFilter = function(senderId, recipientId) {
  const testMessage = {
    sender_id: senderId,
    recipient_id: recipientId,
    content: "Test message"
  };
  
  return shouldShowMessageForContext(testMessage);
};

// Start everything
init();