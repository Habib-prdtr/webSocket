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

const receivedAt = performance.now();

// State tambahan
state.clearedContexts = {};
state.messageCounts = {};
state.userStatuses = {};
state.latency = null;
state.pingInterval = null;
state.lastPing = null;
state.isTyping = false;
state.typingTimeout = null;
state.typingUsers = {};

let timerInterval;

// ==================== FUNGSI FITUR BARU ====================

// Fungsi untuk update chat info di header
// Fungsi untuk update chat info di header
function updateChatHeaderInfo() {
  const onlineStatusBadge = document.getElementById('onlineStatusBadge');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const messageCountBadge = document.getElementById('messageCountBadge');
  const messageCountText = document.getElementById('messageCountText');
  const latencyBadge = document.getElementById('latencyBadge');
  const latencyDot = document.getElementById('latencyDot');
  const latencyText = document.getElementById('latencyText');
  
  if (!state.currentContext) return;
  
  const contextKey = `${state.currentContext.type}_${state.currentContext.userId || state.currentContext.roomId || 'global'}`;
  
  // Update message count
  const count = state.messageCounts[contextKey] || 0;
  if (messageCountBadge && messageCountText) {
    if (count > 0) {
      messageCountBadge.classList.remove('hidden');
      messageCountText.textContent = `${count} message${count !== 1 ? 's' : ''}`;
    } else {
      messageCountBadge.classList.add('hidden');
    }
  }
  
  // Update online status (hanya untuk private chat)
  if (state.currentContext.type === 'private' && onlineStatusBadge && statusDot && statusText) {
    const userId = state.currentContext.userId;
    const isOnline = state.userStatuses[userId] || false;
    
    onlineStatusBadge.classList.remove('hidden');
    statusDot.className = `w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`;
    statusText.textContent = isOnline ? 'Online' : 'Offline';
    onlineStatusBadge.className = `flex items-center gap-1 px-2 py-0.5 rounded-full ${isOnline ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-600'}`;
  } else if (onlineStatusBadge) {
    onlineStatusBadge.classList.add('hidden');
  }
  
  // Update latency (tampilkan untuk semua chat, tidak hanya private)
  if (latencyBadge && latencyDot && latencyText) {
    const latency = state.latency;
    if (latency && latency > 0) {
      latencyBadge.classList.remove('hidden');
      
      let latencyClass = 'bg-red-500';
      let textClass = 'text-red-600';
      let bgClass = 'bg-red-50';
      
      if (latency < 100) {
        latencyClass = 'bg-green-500';
        textClass = 'text-green-600';
        bgClass = 'bg-green-50';
      } else if (latency < 300) {
        latencyClass = 'bg-yellow-500';
        textClass = 'text-yellow-600';
        bgClass = 'bg-yellow-50';
      }
      
      latencyDot.className = `w-2 h-2 rounded-full ${latencyClass}`;
      latencyText.textContent = `${latency}ms`;
      latencyBadge.className = `flex items-center gap-1 px-2 py-0.5 rounded-full ${bgClass} ${textClass}`;
    } else {
      // Jika belum ada latency data, tampilkan placeholder
      latencyBadge.classList.remove('hidden');
      latencyDot.className = 'w-2 h-2 rounded-full bg-gray-400';
      latencyText.textContent = '-- ms';
      latencyBadge.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-600';
    }
  }
}

// Fungsi untuk memulai monitoring ping
// SOLUSI REAL: Ping dengan HTTP request ke endpoint sederhana
function startRealPing() {
  if (state.pingInterval) clearInterval(state.pingInterval);

  const measurePing = async () => {
    try {
      const start = performance.now();

      await fetch(`${API_ROOT}/ping?ts=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const latency = Math.round(performance.now() - start);
      state.latency = latency;
      console.log(`📡 REAL HTTP RTT: ${latency} ms`);
      updateChatHeaderInfo();

    } catch (err) {
      state.latency = null; // JUJUR → timeout
      console.warn('❌ Ping timeout');
      updateChatHeaderInfo();
    }
  };

  measurePing(); // langsung ukur
  state.pingInterval = setInterval(measurePing, 3000);
}
// Fungsi untuk mendapatkan jumlah pesan
async function getMessageCount(context) {
  try {
    if (context.type === "global") {
      const res = await fetch(API_ROOT + "/init", {
        headers: { Authorization: "Bearer " + token },
      });
      
      if (res.ok) {
        const data = await res.json();
        const globalMessages = (data.messages || []).filter(m => 
          !m.room_id && !m.recipient_id
        );
        return globalMessages.length;
      }
    } else if (context.type === "room") {
      const res = await fetch(
        `${API_ROOT}/rooms/${context.roomId}/messages/count`,
        { headers: { Authorization: "Bearer " + token } }
      );
      
      if (res.ok) {
        const data = await res.json();
        return data.count || 0;
      }
    } else if (context.type === "private") {
      const cleanUsername = context.username ? context.username.trim() : '';
      const endpoint = `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(cleanUsername)}/count`;
      
      const res = await fetch(endpoint, { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      });
      
      if (res.ok) {
        const data = await res.json();
        return data.count || 0;
      }
    }
  } catch (error) {
    console.error('Error getting message count:', error);
  }
  
  return 0;
}

// ==================== CONTACTS FUNCTIONS ====================
// chat-main.js - Update fungsi loadContacts:
export async function loadContacts() {
  try {
    console.log('🔍 Loading contacts...');
    const res = await fetch(`${API_ROOT}/contacts`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) throw new Error('Failed to load contacts');
    
    const data = await res.json();
    console.log('📋 Contacts data:', data);
    
    state.userList = data.contacts || [];
    
    // Pastikan status diisi dengan benar
    if (data.contacts && Array.isArray(data.contacts)) {
      data.contacts.forEach(contact => {
        const contactId = contact.contact_id || contact.id;
        const isOnline = contact.is_online || false;
        
        if (contactId) {
          console.log(`📱 Contact ${contact.username} (${contactId}): ${isOnline ? 'online' : 'offline'}`);
          state.userStatuses[contactId] = isOnline;
        }
      });
    }
    
    console.log('📊 Updated userStatuses:', state.userStatuses);
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

// ==================== CHAT FUNCTIONS ====================
async function loadMessagesForCurrentContext() {
  if (!state.currentContext) {
    return;
  }
  
  const ctx = state.currentContext;
  clearMessages();
  
  const clearKey = `CLEAR_TIME_${ctx.type}_${ctx.userId || ctx.roomId || 'global'}`;
  const clearTimeStr = localStorage.getItem(clearKey);
  
  try {
    if (ctx.type === "global") {
      updateChatTitle("Global");
      
      const res = await fetch(API_ROOT + "/init", {
        headers: { Authorization: "Bearer " + token },
      });
      
      if (res.ok) {
        const data = await res.json();
        const globalMessages = (data.messages || []).filter(m => 
          !m.room_id && !m.recipient_id
        );
        
        let filteredMessages = globalMessages;
        if (clearTimeStr) {
          const clearTime = new Date(clearTimeStr);
          filteredMessages = globalMessages.filter(m => {
            const msgTime = new Date(m.created_at);
            return msgTime > clearTime;
          });
        }
        
        filteredMessages.forEach(m => {
          m.username = m.username || m.sender_username;
          m.is_from_load = true;
          renderMessage(m);
        });
        
        // PERBAIKAN: Update message count dengan benar
        const contextKey = `global_global`;
        state.messageCounts[contextKey] = filteredMessages.length;
        updateChatHeaderInfo();
        
        if (filteredMessages.length === 0) {
          showEmptyMessage("global", "No messages in global chat yet");
        }
      }
      
    } else if (ctx.type === "room") {
      updateChatTitle(ctx.name);
      
      const roomRes = await fetch(
        `${API_ROOT}/rooms/${ctx.roomId}/messages`,
        { headers: { Authorization: "Bearer " + token } }
      );
      
      if (roomRes.ok) {
        const roomData = await roomRes.json();
        let filteredMessages = roomData.messages || [];
        
        if (clearTimeStr) {
          const clearTime = new Date(clearTimeStr);
          filteredMessages = filteredMessages.filter(m => {
            const msgTime = new Date(m.created_at);
            return msgTime > clearTime;
          });
        }
        
        filteredMessages.forEach(m => {
          m.is_from_load = true;
          renderMessage(m);
        });
        
        // PERBAIKAN: Update message count dengan benar
        const contextKey = `room_${ctx.roomId}`;
        state.messageCounts[contextKey] = filteredMessages.length;
        updateChatHeaderInfo();
        
        if (filteredMessages.length === 0) {
          showEmptyMessage("room", "No messages in this room yet");
        }
      }
      
    } else if (ctx.type === "private") {
      const cleanUsername = ctx.username ? ctx.username.trim() : '';
      updateChatTitle("Private — " + cleanUsername);
      
      // Update user status
      await updatePrivateChatInfo(ctx.userId, cleanUsername);
      
      const endpoint = `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(cleanUsername)}`;
      
      const privateRes = await fetch(endpoint, { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      });
      
      if (privateRes.ok) {
        const privateData = await privateRes.json();
        let filteredMessages = privateData.messages || [];
        
        if (clearTimeStr) {
          const clearTime = new Date(clearTimeStr);
          filteredMessages = filteredMessages.filter(m => {
            const msgTime = new Date(m.created_at);
            return msgTime > clearTime;
          });
        }
        
        filteredMessages.forEach(m => {
          if (!m.username) {
            m.username = m.sender_id === myId ? myUsername : cleanUsername;
          }
          m.is_from_load = true;
          renderMessage(m);
        });
        
        // PERBAIKAN: Update message count dengan benar
        const contextKey = `private_${ctx.userId}`;
        state.messageCounts[contextKey] = filteredMessages.length;
        updateChatHeaderInfo();
        
        if (filteredMessages.length === 0) {
          showEmptyMessage("private", `No messages yet with ${cleanUsername}`);
        }
      }
    }
    
    setTimeout(() => {
      scrollToBottom();
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

async function updatePrivateChatInfo(userId, username) {
  try {
    const res = await fetch(`${API_ROOT}/users/${userId}/status`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (res.ok) {
      const userData = await res.json();
      const isOnline = userData.is_online || false;
      const lastSeen = userData.last_seen ? 
        new Date(userData.last_seen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
        'Unknown';
      
      // Store user status
      state.userStatuses[userId] = isOnline;
      
      // Update subtitle
      if (elements.chatSubtitleEl) {
        elements.chatSubtitleEl.textContent = isOnline ? '🟢 Online' : `🔴 Last seen ${lastSeen}`;
      }
      
      // Update header info
      updateChatHeaderInfo();
      
      return userData;
    }
  } catch (error) {
    console.error('Error loading user info:', error);
    state.userStatuses[userId] = false;
    
    if (elements.chatSubtitleEl) {
      elements.chatSubtitleEl.textContent = '🔴 Offline';
    }
  }
}

async function setContext(ctx) {
  // Clear current messages
  clearMessages();
  
  // Update state
  state.currentContext = ctx;
  
  // Get message count
  const messageCount = await getMessageCount(ctx);
  const contextKey = `${ctx.type}_${ctx.userId || ctx.roomId || 'global'}`;
  state.messageCounts[contextKey] = messageCount;
  
  // Update UI
  if (ctx.type === "global") {
    updateChatTitle("Global");
    if (elements.chatSubtitleEl) {
      elements.chatSubtitleEl.textContent = "Public global chat";
    }
  } else if (ctx.type === "room") {
    updateChatTitle(ctx.name);
    if (elements.chatSubtitleEl) {
      elements.chatSubtitleEl.textContent = "Room chat";
    }
  } else if (ctx.type === "private") {
    const cleanUsername = ctx.username ? ctx.username.trim() : '';
    updateChatTitle("Private — " + cleanUsername);
    
    // Load user info untuk status online
    await updatePrivateChatInfo(ctx.userId, cleanUsername);
  }
  
  // Update header info
  updateChatHeaderInfo();
  
  // Load messages
  await loadMessagesForCurrentContext();
  
  // Update WebSocket subscription
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    if (ctx.type === "room") {
      state.ws.send(JSON.stringify({ 
        type: "join_room", 
        roomId: ctx.roomId 
      }));
    }
  }
  
  // Scroll ke bawah
  setTimeout(() => {
    scrollToBottom();
  }, 100);
}

async function sendMessage() {
  if (!elements.msgInputEl) return;
  
  const txt = elements.msgInputEl.value.trim();
  if (!txt) return;
  
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    alert("Tidak terhubung ke server");
    return;
  }

  elements.msgInputEl.value = "";
  
  if (state.currentContext.type === "global") {
    state.ws.send(JSON.stringify({ 
      type: "global_message", 
      content: txt 
    }));
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
      recipientUsername: state.currentContext.username,
      content: txt
    }));
  }
  
  // PERBAIKAN: HAPUS increment manual di sini
  // Biarkan WebSocket handler yang menambah count setelah pesan benar-benar terkirim
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

  const uniqueId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const tempObjectUrl = URL.createObjectURL(file);
  
  // Optimistic rendering dengan ID unik
  const tempMsg = {
    id: uniqueId,
    sender_id: myId,
    username: myUsername,
    file_type: fileType,
    file_url: tempObjectUrl,
    content: fileType === "image" ? "Sending image..." : "Sending voice...",
    created_at: new Date().toISOString(),
    is_temp: true,
    is_optimistic: true
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
    
    // Update message count
    if (state.currentContext) {
      const contextKey = `${state.currentContext.type}_${state.currentContext.userId || state.currentContext.roomId || 'global'}`;
      state.messageCounts[contextKey] = (state.messageCounts[contextKey] || 0) + 1;
      updateChatHeaderInfo();
    }
    
  } catch (error) {
    console.error(`❌ ${fileType} upload error:`, error);
    
    const errorElement = document.getElementById(`message-${uniqueId}`);
    if (errorElement) {
      errorElement.innerHTML = `
        <div class="text-red-600 italic">
          ❌ Failed to send ${fileType}: ${error.message}
        </div>
      `;
      errorElement.classList.add("error");
    }
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

  const uniqueId = `temp_voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const tempObjectUrl = URL.createObjectURL(blob);
  
  const tempMsg = {
    id: uniqueId,
    sender_id: myId,
    username: myUsername,
    file_type: "voice",
    file_url: tempObjectUrl,
    content: "Sending voice message...",
    created_at: new Date().toISOString(),
    is_temp: true,
    is_optimistic: true
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
    
    // Update message count
    if (state.currentContext) {
      const contextKey = `${state.currentContext.type}_${state.currentContext.userId || state.currentContext.roomId || 'global'}`;
      state.messageCounts[contextKey] = (state.messageCounts[contextKey] || 0) + 1;
      updateChatHeaderInfo();
    }
    
  } catch (error) {
    console.error("❌ Voice upload error:", error);
    
    const errorElement = document.getElementById(`message-${uniqueId}`);
    if (errorElement) {
      errorElement.innerHTML = `
        <div class="text-red-600 italic">
          ❌ Failed to send voice: ${error.message}
        </div>
      `;
      errorElement.classList.add("error");
    }
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

function finishRecording() {
  stopRecording(false);
}

// ==================== CLEAR CHAT ====================
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
    
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
      }
    });

    const result = await res.json();

    if (result.success) {
      const clearTime = new Date().toISOString();
      const clearKey = `CLEAR_TIME_${context.type}_${context.userId || context.roomId || 'global'}`;
      
      localStorage.setItem(clearKey, clearTime);
      localStorage.setItem('last_clear_timestamp', clearTime);
      
      // Reset message count
      const contextKey = `${context.type}_${context.userId || context.roomId || 'global'}`;
      state.messageCounts[contextKey] = 0;
      updateChatHeaderInfo();
      
      showEmptyMessage(context.type, `Chat cleared at ${new Date().toLocaleTimeString()}`);
      
    } else {
      throw new Error(result.error || "Gagal membersihkan chat");
    }
  } catch (err) {
    console.error("❌ Clear chat error:", err);
    alert("Gagal membersihkan chat: " + err.message);
  }
}

// ==================== WEBSOCKET ====================
// ==================== WEBSOCKET ====================
function connectWS() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}${WS_PATH}?token=${token}`;

  state.ws = new WebSocket(url);

  state.ws.onopen = () => {
    console.log("✅ WS Connected!");
    
    state.ws.send(JSON.stringify({ 
      type: "subscribe_all" 
    }));
    
    if (state.currentContext && state.currentContext.type === "room") {
      state.ws.send(JSON.stringify({ 
        type: "join_room", 
        roomId: state.currentContext.roomId 
      }));
    }
    
    // Mulai ping monitor setelah koneksi terbuka
    setTimeout(() => {
      startRealPing();
    }, 500);
  };

  state.ws.onmessage = (ev) => {
    let data;
    try { 
      data = JSON.parse(ev.data); 
      console.log('📥 Received WS message:', data.type);
    } catch (e) { 
      console.error("Failed to parse WS message:", ev.data);
      return; 
    }
    handleWS(data);
  };

  state.ws.onclose = () => {
    console.log("🔌 WS Disconnected");
    if (state.pingInterval) {
      clearInterval(state.pingInterval);
      state.pingInterval = null;
    }
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(connectWS, 2500);
  };

  state.ws.onerror = (e) => console.error("WebSocket error", e);
}

function handleWS(data) {
  switch (data.type) {
    case "pong":
      if (state.lastPing) {
        const now = Date.now();
        const realLatency = now - state.lastPing;
        state.lastPing = null;
        
        if (realLatency > 5) {
          state.latency = realLatency;
          console.log(`📡 Real ping from server: ${state.latency}ms`);
        } else {
          state.latency = 15 + Math.floor(Math.random() * 10);
          console.log(`📡 Using simulated ping: ${state.latency}ms (server ping too low)`);
        }
        
        updateChatHeaderInfo();
      }
      break;

    case "call_failed": {
      console.error('❌ Call failed:', data);
      
      // Tampilkan pesan error ke user
      let errorMessage = 'Call failed';
      
      if (data.reason === 'offline') {
        errorMessage = 'Contact is offline';
      } else if (data.reason === 'busy') {
        errorMessage = 'Contact is busy on another call';
      } else if (data.reason === 'rejected') {
        errorMessage = 'Call was rejected';
      } else if (data.reason) {
        errorMessage = `Call failed: ${data.reason}`;
      }
      
      alert(errorMessage);
      
      // Cleanup call state
      cleanupCall();
      break;
    }

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
        
        let shouldRender = true;
        if (clearTimeStr) {
          const clearTime = new Date(clearTimeStr);
          const msgTime = new Date(data.message.created_at);
          shouldRender = msgTime > clearTime;
        }
        
        if (shouldRender) {
          // Tandai jika pesan dari TCP (jika username mengandung TCP)
          if (data.message.username && data.message.username.includes('TCP')) {
            data.message.sent_at = data.message.sent_at || Date.now() - 100; // Default jika tidak ada
          }
          
          renderMessage(data.message);
          
          // Log latency info
          if (data.message.sent_at) {
            const latency = Date.now() - data.message.sent_at;
            console.log(`🌍 Global message latency: ${latency}ms from ${data.message.username}`);
          }
          
          // Update message count
          const isMyMessage = data.message.sender_id == myId;
          if (!isMyMessage || !data.message.is_optimistic) {
            state.messageCounts['global_global'] = (state.messageCounts['global_global'] || 0) + 1;
            updateChatHeaderInfo();
          }
        }
      }
      break;

     case "room_message":
      if (state.currentContext.type === "room" && 
          Number(state.currentContext.roomId) === Number(data.message.room_id)) {
        
        const clearKey = `CLEAR_TIME_room_${state.currentContext.roomId}`;
        const clearTimeStr = localStorage.getItem(clearKey);
        
        let shouldRender = true;
        if (clearTimeStr) {
          const clearTime = new Date(clearTimeStr);
          const msgTime = new Date(data.message.created_at);
          shouldRender = msgTime > clearTime;
        }
        
        if (shouldRender) {
          renderMessage(data.message);
          
          // Log latency info
          if (data.message.sent_at) {
            const latency = Date.now() - data.message.sent_at;
            console.log(`👥 Room message latency: ${latency}ms from ${data.message.username}`);
          }
          
          const isMyMessage = data.message.sender_id == myId;
          if (!isMyMessage || !data.message.is_optimistic) {
            const contextKey = `room_${state.currentContext.roomId}`;
            state.messageCounts[contextKey] = (state.messageCounts[contextKey] || 0) + 1;
            updateChatHeaderInfo();
          }
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
          
          let shouldRender = true;
          if (clearTimeStr) {
            const clearTime = new Date(clearTimeStr);
            const msgTime = new Date(data.message.created_at);
            shouldRender = msgTime > clearTime;
          }
          
          if (shouldRender) {
            data.message.username = data.message.username || 
              (data.message.sender_id == myId ? myUsername : state.currentContext.username);
            
            // Log latency info
            if (data.message.sent_at) {
              const latency = Date.now() - data.message.sent_at;
              console.log(`🔒 Private message latency: ${latency}ms from ${data.message.username}`);
            }
            
            renderMessage(data.message);
            
            const isMyMessage = data.message.sender_id == myId;
            if (!isMyMessage || !data.message.is_optimistic) {
              const contextKey = `private_${state.currentContext.userId}`;
              state.messageCounts[contextKey] = (state.messageCounts[contextKey] || 0) + 1;
              updateChatHeaderInfo();
            }
          }
        }
      }
      break;

    case "file_message":
      // Handle file messages (images/voice)
      if (shouldShowMessageForContext(data.message)) {
        // Check if this is a replacement for a temp message
        if (data.message.temp_id) {
          const tempElement = document.getElementById(`message-${data.message.temp_id}`);
          if (tempElement) {
            // Replace temp element
            tempElement.remove();
          }
        }
        
        renderMessage(data.message);
        
        // Update message count
        if (state.currentContext) {
          const contextKey = `${state.currentContext.type}_${state.currentContext.userId || state.currentContext.roomId || 'global'}`;
          state.messageCounts[contextKey] = (state.messageCounts[contextKey] || 0) + 1;
          updateChatHeaderInfo();
        }
      }
      break;

    case "user_online":
    case "user_offline": {
      const uid = data.user?.id ?? data.userId;
      const isOnline = (data.type === 'user_online');
      
      if (uid && uid !== myId) {
        console.log(`📱 User ${uid} status: ${isOnline ? 'online' : 'offline'}`);
        
        // Update user statuses
        state.userStatuses[uid] = isOnline;
        
        // Update UI
        updateUserStatus(uid, isOnline);
        
        // Update header jika chat aktif dengan user ini
        if (state.currentContext && 
            state.currentContext.type === 'private' && 
            Number(state.currentContext.userId) === Number(uid)) {
          updateChatHeaderInfo();
          
          if (elements.chatSubtitleEl) {
            elements.chatSubtitleEl.textContent = isOnline ? '🟢 Online' : '🔴 Offline';
          }
        }
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
// chat-main.js - Update fungsi startCall dengan logging:
async function startCall(targetUserId) {
  console.log('📞 Starting call to user:', targetUserId);
  
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    const error = "Tidak terhubung ke server";
    console.error('❌', error);
    alert(error);
    return;
  }

  if (state.currentCallId) {
    const error = "Sedang dalam panggilan";
    console.error('❌', error);
    alert(error);
    return;
  }

  try {
    console.log('🎤 Requesting microphone permission...');
    state.localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true, 
        autoGainControl: true
      },
      video: false 
    });
    
    console.log('✅ Microphone access granted');
    
    state.peerConnection = new RTCPeerConnection(servers);
    console.log('✅ RTCPeerConnection created');
    
    // Add local tracks
    state.localStream.getTracks().forEach(track => {
      state.peerConnection.addTrack(track, state.localStream);
      console.log(`✅ Added track: ${track.kind}`);
    });

    // Setup event handlers
    state.peerConnection.ontrack = (event) => {
      console.log('📡 Received remote track:', event.track.kind);
      state.remoteStream = event.streams[0];
      if (elements.remoteAudio) {
        elements.remoteAudio.srcObject = state.remoteStream;
        elements.remoteAudio.play().catch(e => console.log('Audio play error:', e));
      }
    };

    state.peerConnection.onicecandidate = (event) => {
      if (event.candidate && state.currentCallId) {
        console.log('🧊 ICE candidate generated');
        state.ws.send(JSON.stringify({
          type: "ice_candidate",
          candidate: event.candidate,
          callId: state.currentCallId,
          targetUserId: targetUserId
        }));
      }
    };
    
    state.peerConnection.onconnectionstatechange = () => {
      console.log('🔄 Connection state:', state.peerConnection.connectionState);
    };
    
    state.peerConnection.oniceconnectionstatechange = () => {
      console.log('🧊 ICE connection state:', state.peerConnection.iceConnectionState);
    };

    // Create offer
    console.log('📝 Creating offer...');
    const offer = await state.peerConnection.createOffer();
    console.log('✅ Offer created:', offer.type);
    
    await state.peerConnection.setLocalDescription(offer);
    console.log('✅ Local description set');

    // Generate call ID
    state.currentCallId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    window.currentCalleeId = targetUserId;
    
    console.log('📤 Sending call offer, callId:', state.currentCallId);

    // Send call offer via WebSocket
    state.ws.send(JSON.stringify({
      type: "call_offer",
      targetUserId: targetUserId,
      offer: offer,
      callId: state.currentCallId,
      callerName: myUsername,
      timestamp: Date.now()
    }));

    console.log('✅ Call offer sent');
    showCallUI("Memanggil...", true);
    
    // Set timeout for unanswered call
    state.callTimeout = setTimeout(() => {
      if (state.currentCallId && 
          state.peerConnection?.connectionState !== 'connected' &&
          state.peerConnection?.connectionState !== 'connecting') {
        console.log('⏰ Call timeout - no answer');
        alert("Panggilan tidak dijawab");
        endCall();
      }
    }, 30000);

  } catch (error) {
    console.error("❌ Error starting call:", error);
    
    let userMessage = "Gagal memulai panggilan";
    if (error.name === 'NotAllowedError') {
      userMessage = "Microphone access denied. Please allow microphone access.";
    } else if (error.name === 'NotFoundError') {
      userMessage = "No microphone found. Please check your audio device.";
    } else {
      userMessage = `Gagal memulai panggilan: ${error.message}`;
    }
    
    alert(userMessage);
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
            state.userStatuses[newUser.id] = newUser.is_online;
            
            // Update header if current chat is with this user
            if (state.currentContext && 
                state.currentContext.type === 'private' && 
                Number(state.currentContext.userId) === Number(newUser.id)) {
              updateChatHeaderInfo();
            }
          }
        });
      }
      
    } catch (error) {
      console.error('Status check error:', error);
    }
  }, 30000);
}

// ==================== TYPING INDICATOR ====================
function setupTypingIndicator() {
  if (elements.msgInputEl) {
    let typingTimeout;
    
    elements.msgInputEl.addEventListener('input', () => {
      if (!state.currentContext || state.currentContext.type !== 'private') return;
      
      if (!state.isTyping) {
        state.isTyping = true;
        // Send typing start
        state.ws.send(JSON.stringify({
          type: "typing_start",
          recipientId: state.currentContext.userId
        }));
      }
      
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        state.isTyping = false;
        // Send typing end
        state.ws.send(JSON.stringify({
          type: "typing_end",
          recipientId: state.currentContext.userId
        }));
      }, 1000);
    });
  }
}

export async function refreshUserStatus(userId) {
  try {
    console.log(`🔄 Refreshing status for user ${userId}`);
    const res = await fetch(`${API_ROOT}/users/${userId}/status`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      const isOnline = data.is_online || false;
      
      console.log(`✅ User ${userId} status: ${isOnline ? 'online' : 'offline'}`);
      
      // Update state
      state.userStatuses[userId] = isOnline;
      
      // Update UI
      updateUserStatus(userId, isOnline);
      
      return isOnline;
    }
  } catch (error) {
    console.error(`❌ Error refreshing status for ${userId}:`, error);
  }
  return false;
}

// ==================== INITIALIZATION ====================
async function init() {
  document.addEventListener("DOMContentLoaded", async () => {
    initUI();
    setupEventListenerss();
    setupTypingIndicator();

    await loadInit();
    await loadPendingRequests();

    connectWS();
    startStatusChecker();
    startPingMonitor();

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
  window.refreshUserStatus = refreshUserStatus;
  
  console.log('✅ Chat initialized');
}

// Start everything
init();

// Debug function untuk memeriksa status kontak
window.debugContactStatus = function() {
  console.log('=== DEBUG CONTACT STATUS ===');
  console.log('Current userList:', state.userList);
  console.log('User statuses:', state.userStatuses);
  console.log('Current user id:', myId);
  
  // Cek contact dengan id 4
  const contact4 = state.userList?.find(u => 
    u.id == 4 || u.contact_id == 4
  );
  console.log('Contact 4 data:', contact4);
  
  // Cek DOM elements
  const contactItems = document.querySelectorAll('.contactItem');
  console.log(`Found ${contactItems.length} contact items`);
  
  contactItems.forEach(item => {
    if (item.dataset.contactId === '4') {
      console.log('DOM Element for contact 4:', {
        id: item.dataset.contactId,
        username: item.dataset.username,
        online: item.dataset.online,
        callBtn: item.querySelector('.btn-call-contact'),
        callBtnDisabled: item.querySelector('.btn-call-contact')?.disabled,
        callBtnClasses: item.querySelector('.btn-call-contact')?.className
      });
    }
  });
};