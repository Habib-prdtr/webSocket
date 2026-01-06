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

// Deklarasi fungsi yang akan digunakan
let timerInterval;

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
    const res = await fetch(`${API_ROOT}/contacts/pending`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) throw new Error('Gagal memuat requests');
    
    const data = await res.json();
    
    let requests = [];
    
    if (data.pending && Array.isArray(data.pending)) {
      requests = data.pending;
    } 
    else if (Array.isArray(data)) {
      requests = data;
    }
    
    state.pendingRequests = requests;
    renderPendingRequests(requests);
    
    updatePendingBadge(requests.length);
    
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

    loadMessagesForCurrentContext();
    
  } catch (error) {
    console.error('Error loading init:', error);
    alert('Gagal memuat data awal');
  }
}

async function loadMessagesForCurrentContext() {
  if (!state.currentContext) {
    return;
  }
  
  const ctx = state.currentContext;
  
  const clearKey = `CLEAR_TIME_${ctx.type}_${ctx.userId || ctx.roomId || 'global'}`;
  const clearTimeStr = localStorage.getItem(clearKey);
  
  if (clearTimeStr) {
    const clearTime = new Date(clearTimeStr);
    
    try {
      const res = await fetch(API_ROOT + "/init", {
        headers: { Authorization: "Bearer " + token },
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      clearMessages();
      const infoMsg = document.createElement("div");
      
      if (elements.messagesEl) {
        elements.messagesEl.appendChild(infoMsg);
      }
      
      if (ctx.type === "global") {
        updateChatTitle("Global", "Public global chat");
        
        const globalMessages = (data.messages || []).filter(m => 
          !m.room_id && !m.recipient_id
        );
        
        let newMessagesCount = 0;
        globalMessages.forEach(m => {
          const msgTime = new Date(m.created_at);
          if (msgTime > clearTime) {
            m.username = `Global — ${m.username || m.sender_username}`;
            m.is_from_load = true;
            renderMessage(m);
            newMessagesCount++;
          }
        });
        
        if (newMessagesCount === 0) {
          const emptyMsg = document.createElement("div");
          if (elements.messagesEl) elements.messagesEl.appendChild(emptyMsg);
        }
        
      } else if (ctx.type === "room") {
        updateChatTitle(ctx.name, "Room chat");
        
        const roomRes = await fetch(
          `${API_ROOT}/rooms/${ctx.roomId}/messages`,
          { headers: { Authorization: "Bearer " + token } }
        );
        
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          
          (roomData.messages || []).forEach(m => {
            const msgTime = new Date(m.created_at);
            if (msgTime > clearTime) {
              m.is_from_load = true;
              renderMessage(m);
            }
          });
        }
        
      } else if (ctx.type === "private") {
        const cleanUsername = ctx.username ? ctx.username.trim() : '';
        updateChatTitle("Private — " + cleanUsername, "Direct message");
        
        const endpoint = `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(cleanUsername)}`;
        const privateRes = await fetch(endpoint, { 
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          } 
        });
        
        if (privateRes.ok) {
          const privateData = await privateRes.json();
          
          (privateData.messages || []).forEach(m => {
            const msgTime = new Date(m.created_at);
            if (msgTime > clearTime) {
              if (!m.username) {
                m.username = m.sender_id === myId ? myUsername : cleanUsername;
              }
              m.is_from_load = true;
              renderMessage(m);
            }
          });
        }
      }
      
      setTimeout(() => {
        if (elements.messagesEl) {
          elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
        }
      }, 100);
      
      updateClearBtnVisibility();
      return;
      
    } catch (error) {
      console.error('Error loading filtered messages:', error);
    }
  }
  
  try {
    const res = await fetch(API_ROOT + "/init", {
      headers: { Authorization: "Bearer " + token },
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    
    if (ctx.type === "global") {
      updateChatTitle("Global", "Public global chat");
      
      const globalMessages = (data.messages || []).filter(m => 
        !m.room_id && !m.recipient_id
      );
      
      globalMessages.forEach(m => {
        m.username = `Global — ${m.username || m.sender_username}`;
        m.is_from_load = true;
        renderMessage(m);
      });
      
      if (globalMessages.length === 0) {
        showEmptyMessage("global", "No messages in global chat yet");
      }
      
    } else if (ctx.type === "room") {
      updateChatTitle(ctx.name, "Room chat");
      
      const roomRes = await fetch(
        `${API_ROOT}/rooms/${ctx.roomId}/messages`,
        { headers: { Authorization: "Bearer " + token } }
      );
      
      if (roomRes.ok) {
        const roomData = await roomRes.json();
        
        (roomData.messages || []).forEach(m => {
          m.is_from_load = true;
          renderMessage(m);
        });
        
        if (roomData.messages?.length === 0) {
          showEmptyMessage("room", "No messages in this room yet");
        }
      }
      
    } else if (ctx.type === "private") {
      const cleanUsername = ctx.username ? ctx.username.trim() : '';
      updateChatTitle("Private — " + cleanUsername, "Direct message");
      
      const endpoint = `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(cleanUsername)}`;
      
      const privateRes = await fetch(endpoint, { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      });
      
      if (privateRes.ok) {
        const privateData = await privateRes.json();
        
        (privateData.messages || []).forEach(m => {
          if (!m.username) {
            m.username = m.sender_id === myId ? myUsername : cleanUsername;
          }
          m.is_from_load = true;
          renderMessage(m);
        });
        
        if (privateData.messages?.length === 0) {
          showEmptyMessage("private", `No messages yet with ${cleanUsername}`);
        }
      }
    }
    
    setTimeout(() => {
      if (elements.messagesEl) {
        elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
      }
    }, 100);
    
  } catch (error) {
    console.error('Error loading messages:', error);
    showErrorMessage("Failed to load messages: " + error.message);
  }
  
  updateClearBtnVisibility();
}

export function scrollToBottom() {
  if (elements.messagesEl) {
    elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
  }
}

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
  state.currentContext = ctx;
  await loadMessagesForCurrentContext();
}

async function sendMessage() {
  if (!elements.msgInputEl) return;
  
  const txt = elements.msgInputEl.value.trim();
  if (!txt) return;
  
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    alert("Tidak terhubung ke server");
    return;
  }

  const messageContent = txt;
  
  elements.msgInputEl.value = "";
  
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

  const context = state.currentContext;
  
  if (context.type === "room") {
    formData.append("roomId", context.roomId);
  } else if (context.type === "private") {
    formData.append("recipientId", context.userId);
  }

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
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    URL.revokeObjectURL(tempObjectUrl);
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      const wsMessage = {
        type: "file_uploaded",
        fileUrl: data.fileUrl,
        fileType: fileType,
        context: context,
        senderId: myId,
        senderUsername: myUsername
      };
      
      state.ws.send(JSON.stringify(wsMessage));
    }
    
    setTimeout(() => {
      const tempElement = document.getElementById(`message-temp_${fileType}_${Date.now()}`);
      if (tempElement) {
        tempElement.remove();
      }
    }, 2000);
    
  } catch (error) {
    console.error(`❌ ${fileType} upload error:`, error);
    
    const tempId = `temp_${fileType}_${Date.now()}`;
    const errorElement = document.getElementById(`message-${tempId}`);
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
  const context = state.currentContext;
  const formData = new FormData();
  formData.append("file", blob, "voice.webm");
  formData.append("sender_id", myId);
  formData.append("sender_username", myUsername);
  formData.append("content", "Voice message");

  if (context.type === "room") {
    formData.append("roomId", context.roomId);
  } else if (context.type === "private") {
    formData.append("recipientId", context.userId);
  }

  const tempObjectUrl = URL.createObjectURL(blob);
  const tempMsg = {
    id: `temp_voice_${Date.now()}`,
    sender_id: myId,
    username: myUsername,
    file_type: "voice",
    file_url: tempObjectUrl,
    content: "Sending voice message...",
    created_at: new Date().toISOString(),
    is_temp: true
  };
  
  renderMessage(tempMsg);

  try {
    const res = await fetch("/api/upload/voice", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    URL.revokeObjectURL(tempObjectUrl);
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      const wsMessage = {
        type: "file_uploaded",
        fileUrl: data.fileUrl,
        fileType: "voice",
        context: context,
        senderId: myId,
        senderUsername: myUsername
      };
      
      state.ws.send(JSON.stringify(wsMessage));
    }
    
    setTimeout(() => {
      const tempElement = document.getElementById(`message-temp_voice_${Date.now()}`);
      if (tempElement) {
        tempElement.remove();
      }
    }, 2000);
    
  } catch (error) {
    console.error("❌ Voice upload error:", error);
    
    const tempId = `temp_voice_${Date.now()}`;
    const errorElement = document.getElementById(`message-${tempId}`);
    if (errorElement) {
      errorElement.innerHTML = `
        <div class="text-red-600 italic">
          ❌ Failed to send voice: ${error.message}
        </div>
      `;
    }
  }
}

function finishRecording() {
  stopRecording(false);
}

// ==================== CLEAR CHAT (PERMANENT) ====================
async function clearChat() {
  if (!state.currentContext || !state.currentContext.type) {
    alert('Pilih chat terlebih dahulu!');
    return;
  }

  const context = state.currentContext;
  const contextName = 
    context.type === 'global' ? 'Global' :
    context.type === 'room' ? context.name || 'Room' :
    context.type === 'private' ? context.username || 'Private' : 'Chat';

  const confirmed = confirm(
    "Yakin ingin membersihkan chat?"
  );
  
  if (!confirmed) return;

  let endpoint = "";
  
  if (context.type === "global") {
    endpoint = "/api/chat/clear/global";
  } else if (context.type === "room" && context.roomId) {
    endpoint = `/api/chat/clear/room/${context.roomId}`;
  } else if (context.type === "private" && context.userId) {
    endpoint = `/api/chat/clear/private/${context.userId}`;
  } else {
    alert('Tidak bisa membersihkan chat: konteks tidak valid');
    return;
  }

  try {
    clearMessages();
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "system-message loading text-center p-4 bg-blue-50 border border-blue-200 rounded-xl mb-3";
    loadingMsg.innerHTML = `
      <div class="text-blue-700 font-medium mb-1">⏳ Membersihkan pesan lama...</div>
      <div class="text-sm text-blue-600">Pesan baru tetap bisa dikirim</div>
    `;
    if (elements.messagesEl) elements.messagesEl.appendChild(loadingMsg);

    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
      }
    });

    const result = await res.json();

    if (loadingMsg.parentNode) {
      loadingMsg.parentNode.removeChild(loadingMsg);
    }

    if (result.success) {
      const clearTime = new Date().toISOString();
      const clearKey = `CLEAR_TIME_${context.type}_${context.userId || context.roomId || 'global'}`;
      
      localStorage.setItem(clearKey, clearTime);
      localStorage.setItem('last_clear_timestamp', clearTime);
      
      clearMessages();
      
      const infoMsg = document.createElement("div");
      
      if (elements.messagesEl) {
        elements.messagesEl.appendChild(infoMsg);
      }
      
    } else {
      throw new Error(result.error || "Gagal membersihkan chat");
    }
  } catch (err) {
    console.error("❌ Clear chat error:", err);
    
    const existingLoading = document.querySelector('.system-message.loading');
    if (existingLoading) existingLoading.remove();
    
    const errorMsg = document.createElement("div");
    errorMsg.className = "system-message error text-center p-4 bg-red-50 border border-red-200 rounded-xl mb-3";
    errorMsg.innerHTML = `
      <div class="text-red-700 font-medium mb-1">❌ GAGAL Membersihkan Chat</div>
      <div class="text-sm text-red-600">${err.message}</div>
    `;
    
    if (elements.messagesEl) {
      elements.messagesEl.appendChild(errorMsg);
    }
  }
}

function loadClearedChats() {
  try {
    const saved = localStorage.getItem('clearedChats');
    if (saved) {
      state.clearedChats = JSON.parse(saved);
    }
    
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

// ==================== WEBSOCKET ====================
function connectWS() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}${WS_PATH}?token=${token}`;

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    console.log("✅ WS Connected!");
    console.log("ini token" + token);
    
    state.ws.send(JSON.stringify({ 
      type: "subscribe_all" 
    }));
    
    if (state.currentContext && state.currentContext.type === "room") {
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
  switch (data.type) {
    case "init":
      if (data.rooms) renderRooms(data.rooms, setContext);
      break;

    case "room_created":
      loadInit();
      break;

    case "global_message":
      if (state.currentContext.type === "global") {
        const clearKey = `CLEAR_TIME_global_global`;
        const clearTimeStr = localStorage.getItem(clearKey);
        
        if (clearTimeStr) {
          const clearTime = new Date(clearTimeStr);
          const msgTime = new Date(data.message.created_at);
          
          if (msgTime > clearTime) {
            renderMessage(data.message);
          }
        } else {
          renderMessage(data.message);
        }
      }
      break;

    case "room_message":
      if (state.currentContext.type === "room" && 
          Number(state.currentContext.roomId) === Number(data.message.room_id)) {
        
        const clearKey = `CLEAR_TIME_room_${state.currentContext.roomId}`;
        const clearTimeStr = localStorage.getItem(clearKey);
        
        if (clearTimeStr) {
          const clearTime = new Date(clearTimeStr);
          const msgTime = new Date(data.message.created_at);
          
          if (msgTime > clearTime) {
            renderMessage(data.message);
          }
        } else {
          renderMessage(data.message);
        }
      }
      break;

    case "private_message":
      if (state.currentContext.type === "private") {
        const msgSenderId = Number(data.message.sender_id);
        const msgRecipientId = Number(data.message.recipient_id);
        const currentUserId = Number(state.currentContext.userId);
        const myIdNum = Number(myId);
        
        const shouldShowByContext = 
          (msgSenderId === myIdNum && msgRecipientId === currentUserId) ||
          (msgSenderId === currentUserId && msgRecipientId === myIdNum);
        
        if (shouldShowByContext) {
          const clearKey = `CLEAR_TIME_private_${state.currentContext.userId}`;
          const clearTimeStr = localStorage.getItem(clearKey);
          
          if (clearTimeStr) {
            const clearTime = new Date(clearTimeStr);
            const msgTime = new Date(data.message.created_at);
            
            if (msgTime > clearTime) {
              data.message.username = data.message.username || 
                (data.message.sender_id == myId ? myUsername : state.currentContext.username);
              renderMessage(data.message);
            }
          } else {
            data.message.username = data.message.username || 
              (data.message.sender_id == myId ? myUsername : state.currentContext.username);
            renderMessage(data.message);
          }
        }
      }
      break;

    case "file_message":
      if (state.currentContext.type === "private") {
        const msgSenderId = Number(data.message.sender_id);
        const msgRecipientId = Number(data.message.recipient_id);
        const currentUserId = Number(state.currentContext.userId);
        const myIdNum = Number(myId);
        
        const shouldShow = 
          (msgSenderId === myIdNum && msgRecipientId === currentUserId) ||
          (msgSenderId === currentUserId && msgRecipientId === myIdNum);
        
        if (shouldShow) {
          data.message.username = data.message.username || 
            (data.message.sender_id == myId ? myUsername : state.currentContext.username);
          renderMessage(data.message);
        }
      } else if (state.currentContext.type === "room") {
        if (Number(data.message.room_id) === Number(state.currentContext.roomId)) {
          renderMessage(data.message);
        }
      } else if (state.currentContext.type === "global") {
        if (!data.message.room_id && !data.message.recipient_id) {
          renderMessage(data.message);
        }
      }
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
      loadPendingRequests();
      
      if (Notification.permission === "granted") {
        new Notification("New Contact Request", {
          body: `${data.fromUsername} wants to add you as a contact`
        });
      }
      break;
      
    case "contact_accepted":
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

    default:
      console.log('Unknown WS type:', data.type);
      break;
  }
}

// ==================== VOICE CALL FUNCTIONS ====================
async function startCall(targetUserId) {
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
    } else {
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
  if (state.currentCallId) {
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
  if (state.peerConnection && state.currentCallId === data.callId) {
    try {
      await state.peerConnection.setRemoteDescription(data.answer);
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

// ==================== INITIALIZATION ====================
async function init() {
  document.addEventListener("DOMContentLoaded", async () => {
    loadClearedChats();

    initUI();
    setupEventListenerss();

    updateClearBtnVisibility();

    await loadInit();
    await loadPendingRequests();

    connectWS();
    startStatusChecker();

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

// Start everything
init();