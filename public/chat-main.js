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

if (!state.clearedContexts) {
  state.clearedContexts = {};
  
  // Coba load dari sessionStorage
  try {
    const saved = sessionStorage.getItem('clearedContexts');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Filter hanya yang masih dalam 30 menit
      const now = Date.now();
      Object.keys(parsed).forEach(key => {
        if (now - parsed[key] < 30 * 60 * 1000) { // 30 menit
          state.clearedContexts[key] = parsed[key];
        }
      });
      console.log('📁 Loaded cleared contexts from sessionStorage:', state.clearedContexts);
    }
  } catch (e) {
    console.warn('Failed to load cleared contexts from sessionStorage:', e);
  }
}

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
    console.log('🔄 Memuat pending requests...');
    
    const res = await fetch(`${API_ROOT}/contacts/pending`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      console.error('Gagal memuat requests:', res.status, res.statusText);
      throw new Error('Gagal memuat requests');
    }
    
    const data = await res.json();
    console.log('📨 Data dari API:', data);
    
    // Ambil array requests
    let requests = [];
    
    if (data.pending && Array.isArray(data.pending)) {
      requests = data.pending;
      console.log(`✅ ${requests.length} requests ditemukan di data.pending`);
    } 
    else if (Array.isArray(data)) {
      requests = data;
      console.log(`✅ ${requests.length} requests ditemukan di array langsung`);
    }
    
    // Simpan ke state
    state.pendingRequests = requests;
    
    // Render requests list
    renderPendingRequests(requests);
    
    // ==================== UPDATE BADGE ====================
    console.log(`🎯 Memperbarui badge dengan ${requests.length} requests`);
    
    // PASTIKAN FUNGSI updatePendingBadge DIPANGGIL
    if (typeof updatePendingBadge === 'function') {
      console.log('✅ Memanggil updatePendingBadge()');
      updatePendingBadge(requests.length);
    } else if (window.updatePendingBadge) {
      console.log('✅ Memanggil window.updatePendingBadge()');
      window.updatePendingBadge(requests.length);
    } else {
      console.error('❌ Fungsi updatePendingBadge tidak ditemukan!');
      
      // Fallback: update badge manual
      const badge = document.getElementById('pendingBadge');
      if (badge) {
        badge.textContent = requests.length;
        if (requests.length > 0) {
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    }
    
    // Update badge di state juga
    if (window.updatePendingBadge) {
      window.updatePendingBadge(requests.length);
    }
    
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
    
    // Load contacts dari init data
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

    // PERBAIKAN: Handle global messages berdasarkan cleared state
    if (state.currentContext.type === "global") {
      const contextKey = "global_global";
      const wasClearedRecently = state.clearedContexts && state.clearedContexts[contextKey];
      
      if (wasClearedRecently && Date.now() - wasClearedRecently < 30 * 60 * 1000) {
        // Chat global sudah dibersihkan (dalam 30 menit terakhir)
        console.log('⚠️ Global chat was cleared recently, not loading messages');
        
        clearMessages();
        
        const clearedMsg = document.createElement("div");
        clearedMsg.className = "system-message info text-center py-8 text-slate-400 text-sm";
        clearedMsg.innerHTML = `
          <div class="mb-2">🧹</div>
          <div>Global chat telah dibersihkan</div>
          <div class="text-xs mt-1 text-slate-500">
            Pesan yang dihapus tidak akan tampil<br>
            <button onclick="window.clearClearedState('global_global')" 
                    class="mt-1 text-xs bg-blue-500 text-white px-2 py-1 rounded">
              Tampilkan Pesan Lama
            </button>
          </div>
        `;
        if (elements.messagesEl) elements.messagesEl.appendChild(clearedMsg);
        
      } else {
        // Load global messages seperti biasa
        clearMessages();
        (data.messages || []).forEach((m) => {
          if (!m.room_id && !m.recipient_id) {
            m.username = `Global — ${m.username}`;
            renderMessage(m);
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error loading init:', error);
    alert('Gagal memuat data awal');
  }
}

async function setContext(ctx) {
  console.log('🔄 Setting context:', ctx);
  
  // PERBAIKAN: Cek apakah context ini sudah dibersihkan
  const contextKey = `${ctx.type}_${ctx.roomId || ctx.userId || 'global'}`;
  const wasClearedRecently = state.clearedContexts && state.clearedContexts[contextKey];
  
  if (wasClearedRecently && Date.now() - wasClearedRecently < 30000) {
    console.log(`⚠️ Context ${contextKey} was cleared recently, showing empty chat`);
    
    state.currentContext = ctx;
    
    if (ctx.type === "global") {
      updateChatTitle("Global", "Public global chat");
    }
    
    // Kosongkan chat area
    clearMessages();
    
    // Tampilkan pesan bahwa chat sudah dibersihkan
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "system-message info text-center py-8 text-slate-400 text-sm";
    emptyMsg.innerHTML = `
      <div class="mb-2">🧹</div>
      <div>Chat telah dibersihkan</div>
      <div class="text-xs mt-1 text-slate-500">
        Pesan yang Anda hapus tidak akan tampil lagi<br>
        Pesan baru akan tetap diterima
      </div>
      <button onclick="forceReloadContext(true)" 
              class="mt-2 text-xs bg-blue-500 text-white px-3 py-1 rounded">
        Muat Ulang Pesan
      </button>
    `;
    if (elements.messagesEl) elements.messagesEl.appendChild(emptyMsg);
    
    updateClearBtnVisibility();
    return;
  }
  
  state.currentContext = ctx;

  if (ctx.type === "global") {
    updateChatTitle("Global", "Public global chat");

    try {
      // PERBAIKAN: Gunakan endpoint yang benar - dari init data
      const res = await fetch(API_ROOT + "/init", {
        headers: { Authorization: "Bearer " + token },
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      console.log('📦 Loaded global messages from init:', data.messages?.length || 0);
      
      clearMessages();
      
      // Filter hanya global messages
      const globalMessages = (data.messages || []).filter((m) => 
        !m.room_id && !m.recipient_id
      );
      
      console.log(`📊 Found ${globalMessages.length} global messages`);
      
      if (globalMessages.length > 0) {
        globalMessages.forEach((m) => {
          m.username = `Global — ${m.username}`;
          renderMessage(m);
        });
      } else {
        // Tampilkan pesan kosong
        const emptyMsg = document.createElement("div");
        emptyMsg.className = "system-message info text-center py-8 text-slate-400 text-sm";
        emptyMsg.innerHTML = `
          <div class="mb-2">🌍</div>
          <div>No messages in global chat yet</div>
          <div class="text-xs mt-1 text-slate-500">Be the first to send a message!</div>
        `;
        if (elements.messagesEl) elements.messagesEl.appendChild(emptyMsg);
      }
      
    } catch (error) {
      console.error('Error loading global messages:', error);
      
      // Fallback: tampilkan pesan error
      clearMessages();
      const errorMsg = document.createElement("div");
      errorMsg.className = "system-message error p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-3";
      errorMsg.innerHTML = `
        <div class="font-medium">Error Loading Messages</div>
        <div class="text-sm mt-1">${error.message}</div>
      `;
      if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
    }

    updateClearBtnVisibility();
    return;
  }

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
    // FIXED: Bersihkan username
    const cleanUsername = ctx.username ? ctx.username.trim() : '';
    const userId = ctx.userId;
    
    console.log('🔒 Starting private chat with:', { 
      userId, 
      username: cleanUsername
    });
    
    updateChatTitle("Private — " + cleanUsername, "Direct message");

    try {
      // ENDPOINT YANG BENAR (berdasarkan test):
      // /api/private/{myUsername}/{targetUsername}
      const endpoint = `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(cleanUsername)}`;
      
      console.log('📡 Fetching from endpoint:', endpoint);
      
      const res = await fetch(endpoint, { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } 
      });
      
      console.log('📡 Response status:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
        
        // Coba parse error message
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // Jika bukan JSON, gunakan teks asli
          if (errorText && errorText.length < 200) {
            errorMessage = errorText;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      const json = await res.json();
      console.log('📦 Private messages loaded:', json.messages?.length || 0, 'messages');
      
      clearMessages();
      
      if (json.messages && json.messages.length > 0) {
        json.messages.forEach(m => {
          // Tambahkan username jika tidak ada
          if (!m.username) {
            m.username = m.sender_id === myId ? myUsername : cleanUsername;
          }
          renderMessage(m);
        });
      } else {
        // Tampilkan pesan kosong
        const emptyMsg = document.createElement("div");
        emptyMsg.className = "system-message info text-center py-8 text-slate-400 text-sm";
        emptyMsg.innerHTML = `
          <div class="mb-2">💬</div>
          <div>No messages yet with ${cleanUsername}</div>
          <div class="text-xs mt-1 text-slate-500">Send a message to start the conversation</div>
        `;
        if (elements.messagesEl) elements.messagesEl.appendChild(emptyMsg);
      }
      
    } catch (error) {
      console.error('❌ Error loading private messages:', error);
      handlePrivateChatError(error, cleanUsername);
    }

    updateClearBtnVisibility();
    return;
  }

  setTimeout(() => {
    const tempMessages = document.querySelectorAll('[id^="message-temp_"]');
    if (tempMessages.length > 0) {
      console.log(`⚠️ Found ${tempMessages.length} temporary messages after context load`);
      console.log('This might mean WebSocket messages were not received');
      
      // Tampilkan warning ke user (opsional)
      if (tempMessages.length > 0 && window.lastUploadedMessage) {
        const warning = document.createElement("div");
        warning.className = "system-message warning text-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-3";
        warning.innerHTML = `
          <div class="text-yellow-700 text-sm">
            <span class="font-medium">Note:</span> Some messages might not sync properly.
            <button onclick="location.reload()" class="ml-2 text-blue-600 hover:underline">
              Refresh page
            </button>
          </div>
        `;
        if (elements.messagesEl) {
          elements.messagesEl.appendChild(warning);
        }
      }
    }
  }, 1000);

  updateClearBtnVisibility();
}

// Helper function untuk handle error
function handlePrivateChatError(error, username) {
  clearMessages();
  
  const errorMsg = document.createElement("div");
  errorMsg.className = "system-message error p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 mb-3";
  
  if (error.message.includes('404')) {
    errorMsg.innerHTML = `
      <div class="font-medium">Cannot Start Chat</div>
      <div class="text-sm mt-1">Unable to load conversation with ${username}.</div>
      <div class="text-xs mt-2 text-red-600">Make sure this user exists and you are connected.</div>
    `;
  } else if (error.message.includes('contact')) {
    errorMsg.innerHTML = `
      <div class="font-medium">Contact Required</div>
      <div class="text-sm mt-1">You need to add ${username} as a contact first.</div>
    `;
  } else {
    errorMsg.innerHTML = `
      <div class="font-medium">Error Loading Messages</div>
      <div class="text-sm mt-1">${error.message}</div>
    `;
  }
  
  if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
  
  // Tampilkan tombol untuk add contact jika error karena bukan kontak
  if (error.message.includes('contact') || error.message.includes('404')) {
    const suggestion = document.createElement("div");
    suggestion.className = "system-message info flex flex-col gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200 text-center";
    
    suggestion.innerHTML = `
      <div class="text-sm text-blue-700">
        ${error.message.includes('404') ? 
          `The user "${username}" may not exist or you don't have permission to chat.` : 
          `Add ${username} as a contact to start chatting.`}
      </div>
      <button id="btnAddThisContact" class="bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-4 py-2 rounded-full transition shadow">
        ${error.message.includes('404') ? 'Search User' : `Add ${username} as Contact`}
      </button>
    `;

    elements.messagesEl.appendChild(suggestion);
    
    // Event listener untuk tombol
    document.getElementById('btnAddThisContact')?.addEventListener('click', async () => {
      if (error.message.includes('404')) {
        // Untuk 404, buka modal search
        if (window.showAddContactModal) {
          showAddContactModal();
          // Isi search input dengan username
          if (elements.searchContactInput) {
            elements.searchContactInput.value = username;
          }
        }
      } else {
        // Untuk contact error, langsung kirim request
        if (window.sendContactRequest) {
          const result = await sendContactRequest(username);
          if (result && result.success) {
            // Reload contacts
            if (window.loadContacts) {
              await window.loadContacts();
            }
            // Tampilkan success message
            const successMsg = document.createElement("div");
            successMsg.className = "system-message success p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 mt-3";
            successMsg.textContent = `Contact request sent to ${username}!`;
            elements.messagesEl.appendChild(successMsg);
          }
        }
      }
    });
  }
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
  console.log('📸 [IMAGE] Uploading file:', file.name, file.type);
  
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
  
  // TAMBAHKAN DATA KONTEKS
  formData.append("sender_id", myId);
  formData.append("sender_username", myUsername);
  
  if (context.type === "room") {
    formData.append("roomId", context.roomId);
    formData.append("type", "room");
  } else if (context.type === "private") {
    formData.append("recipientId", context.userId);
    formData.append("type", "private");
  } else {
    formData.append("type", "global");
  }

  // ==================== OPTIMISTIC UPDATE UNTUK IMAGE ====================
  const tempObjectUrl = URL.createObjectURL(file);
  
  // Optimistic message untuk image
  const optimisticMessage = {
    id: 'temp_image_' + Date.now(),
    sender_id: myId,
    sender_username: myUsername,
    username: myUsername,
    file_type: fileType,
    file_url: tempObjectUrl,
    content: fileType === "image" ? "Mengirim gambar..." : "Mengirim voice...",
    created_at: new Date().toISOString(),
    is_optimistic: true,
    is_temp_url: true,
    room_id: context.type === "room" ? context.roomId : null,
    recipient_id: context.type === "private" ? context.userId : null
  };
  
  // RENDER SEKARANG JUGA dengan preview
  renderMessage(optimisticMessage);
  console.log(`✅ Optimistic ${fileType} message rendered dengan preview`);
  
  // Scroll ke bawah
  setTimeout(() => {
    if (elements.messagesEl) {
      elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
    }
  }, 50);

  try {
    // Upload di background
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Upload gagal');
    }
    
    if (!data.fileUrl) {
      throw new Error('Upload gagal: tidak ada URL file');
    }
    
    // Revoke temporary URL karena sudah dapat URL dari server
    URL.revokeObjectURL(tempObjectUrl);
    
    console.log(`✅ ${fileType} upload successful:`, data.fileUrl);
    
    // Server akan mengirim WebSocket message dengan data real
    // Optimistic message akan di-replace oleh server message
    
  } catch (error) {
    console.error(`❌ ${fileType} upload error:`, error);
    
    // Update optimistic message menjadi error
    const errorMessage = {
      ...optimisticMessage,
      content: `❌ Gagal mengirim ${fileType === "image" ? "gambar" : "voice"}`,
      is_error: true
    };
    
    // Hapus optimistic message yang lama
    const tempElements = document.querySelectorAll(`[id*="temp_${fileType}_"]`);
    tempElements.forEach(el => el.remove());
    
    // Render error message
    renderMessage(errorMessage);
    
    // Revoke temp URL jika error
    URL.revokeObjectURL(tempObjectUrl);
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
    
    state.mediaRecorder.onstop = () => {
      console.log('⏹️ Recording stopped, processing chunks...');
      
      // Stop semua tracks
      stream.getTracks().forEach(track => track.stop());
      
      // Upload hanya jika tidak dicancel dan ada chunks
      if (!state.recordingCancelled && state.audioChunks.length > 0) {
        console.log(`📦 Creating blob from ${state.audioChunks.length} chunks`);
        const audioBlob = new Blob(state.audioChunks, { type: "audio/webm" });
        
        // Upload dengan error handling
        uploadVoiceBlob(audioBlob).catch(err => {
          console.error('❌ Voice upload failed:', err);
          alert('Gagal mengirim voice message: ' + err.message);
        });
      }
      
      // Reset state
      state.audioChunks = [];
      state.recordingCancelled = false;
      console.log('🔄 Recording state reset');
    };
    
    // Mulai recording
    state.mediaRecorder.start();
    state.isRecording = true;
    state.recordTimer = 0;

    // Update UI
    updateRecordingUI(true);
    
    // Start timer
    timerInterval = setInterval(() => {
      state.recordTimer++;
      updateRecordTimer(state.recordTimer);
      
      // Auto-stop at 2 minutes
      if (state.recordTimer >= 120) {
        console.log('⏱️ Maximum recording time reached');
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
  
  console.log(cancel ? '❌ Cancelling recording' : '✅ Finishing recording');
  
  state.isRecording = false;
  state.recordingCancelled = cancel;
  
  // HENTIKAN UI RECORDING SEGERA
  updateRecordingUI(false);
  clearInterval(timerInterval);
  
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  
  // Reset untuk recording berikutnya
  if (cancel) {
    state.audioChunks = [];
    console.log('🗑️ Recording cancelled');
  }
}

async function uploadVoiceBlob(blob) {
  console.log('🎤 [VOICE] Uploading voice blob...');
  
  const context = state.currentContext;
  const formData = new FormData();
  formData.append("file", blob, "voice.webm");
  formData.append("sender_id", myId);
  formData.append("sender_username", myUsername);
  formData.append("content", "Voice message");

  if (context.type === "room") {
    formData.append("roomId", context.roomId);
    formData.append("type", "room");
  } else if (context.type === "private") {
    formData.append("recipientId", context.userId);
    formData.append("type", "private");
  } else {
    formData.append("type", "global");
  }

  // ==================== OPTIMISTIC UPDATE ====================
  const tempObjectUrl = URL.createObjectURL(blob);
  const optimisticId = 'temp_voice_' + Date.now();
  
  const optimisticMessage = {
    id: optimisticId,
    sender_id: myId,
    sender_username: myUsername,
    username: myUsername,
    file_type: "voice",
    file_url: tempObjectUrl,
    content: "Voice message",
    created_at: new Date().toISOString(),
    is_optimistic: true,
    is_temp_url: true,
    room_id: context.type === "room" ? context.roomId : null,
    recipient_id: context.type === "private" ? context.userId : null
  };
  
  // RENDER SEKARANG JUGA
  renderMessage(optimisticMessage);
  console.log('✅ Optimistic voice message rendered, ID:', optimisticId);
  
  // Scroll ke bawah - GUNAKAN FUNGSI LOKAL
  setTimeout(() => {
    if (elements.messagesEl) {
      elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
    }
  }, 50);
  
  try {
    const res = await fetch("/api/upload/voice", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });

    const data = await res.json();
    console.log('📥 [VOICE] Server response:', data);
    
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Upload failed');
    }
    
    if (!data.fileUrl) {
      throw new Error('No file URL returned');
    }
    
    console.log('✅ Upload successful, waiting for WebSocket...');
    
    // Jika server mengembalikan message data
    if (data.message && data.message.id) {
      window.lastUploadedMessage = {
        id: optimisticId,
        serverMessage: data.message,
        timestamp: Date.now()
      };
      
      console.log('📝 Server returned message:', data.message);
      
      // Hapus optimistic message setelah beberapa saat
      setTimeout(() => {
        const tempElements = document.querySelectorAll(`[id*="${optimisticId}"]`);
        if (tempElements.length > 0) {
          console.log(`🗑️ Removing ${tempElements.length} optimistic messages`);
          tempElements.forEach(el => el.remove());
        }
        
        // Render message dari server jika belum ada
        const existingMsg = document.querySelector(`[id="message-${data.message.id}"]`);
        if (!existingMsg) {
          renderMessage(data.message);
        }
      }, 1000);
    }
    
    // Revoke temporary URL
    URL.revokeObjectURL(tempObjectUrl);
    
    return data;
    
  } catch (error) {
    console.error("❌ [VOICE] Upload error:", error);
    
    // Update optimistic message menjadi error
    const errorMessage = {
      ...optimisticMessage,
      content: "❌ Gagal mengirim voice: " + error.message,
      is_error: true
    };
    
    // Hapus optimistic message yang lama
    const tempElements = document.querySelectorAll(`[id*="${optimisticId}"]`);
    console.log(`🗑️ Removing ${tempElements.length} error messages`);
    tempElements.forEach(el => el.remove());
    
    // Render error message
    renderMessage(errorMessage);
    
    // Revoke temp URL
    URL.revokeObjectURL(tempObjectUrl);
  }
}

function finishRecording() {
  console.log('🔄 Finishing recording...');
  stopRecording(false);
  
}

// ==================== CLEAR CHAT ====================
async function clearChat() {
  if (!state.currentContext.type) return;

  if (!confirm("Bersihkan chat hanya untuk Anda? Hanya pesan yang Anda kirim yang akan dihapus, pesan lawan bicara tetap ada.")) {
    return;
  }

  let url = "";
  let contextName = "";
  
  if (state.currentContext.type === "global") {
    url = `/api/chat/clear/global`;
    contextName = "Global";
  } else if (state.currentContext.type === "room") {
    url = `/api/chat/clear/room/${state.currentContext.roomId}`;
    contextName = state.currentContext.name;
  } else if (state.currentContext.type === "private") {
    url = `/api/chat/clear/private/${state.currentContext.userId}`;
    contextName = state.currentContext.username;
  }

  console.log('🧹 Clearing chat:', contextName, 'URL:', url);

  try {
    // Tampilkan loading
    clearMessages();
    const loadingMsg = document.createElement("div");
    loadingMsg.className = "system-message loading text-center p-4 bg-blue-50 border border-blue-200 rounded-xl mb-3";
    loadingMsg.innerHTML = `
      <div class="text-blue-700 font-medium mb-1">⏳ Membersihkan chat ${contextName}...</div>
      <div class="text-sm text-blue-600">Harap tunggu</div>
    `;
    if (elements.messagesEl) elements.messagesEl.appendChild(loadingMsg);

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
      // PERBAIKAN: Simpan state cleared contexts di sessionStorage agar bertahan saat refresh
      const contextKey = `${state.currentContext.type}_${state.currentContext.roomId || state.currentContext.userId || 'global'}`;
      
      if (!state.clearedContexts) {
        state.clearedContexts = {};
      }
      
      // Simpan di state
      state.clearedContexts[contextKey] = Date.now();
      
      // PERBAIKAN PENTING: Simpan juga di sessionStorage
      try {
        sessionStorage.setItem('clearedContexts', JSON.stringify(state.clearedContexts));
        console.log(`✅ Saved cleared contexts to sessionStorage`);
      } catch (e) {
        console.warn('Could not save to sessionStorage:', e);
      }
      
      console.log(`✅ Marked context ${contextKey} as cleared`);
      
      // Tampilkan pesan sukses
      const successMsg = document.createElement("div");
      successMsg.className = "system-message success text-center p-4 bg-green-50 border border-green-200 rounded-xl mb-3";
      successMsg.innerHTML = `
        <div class="text-green-700 font-medium mb-1">✅ Chat ${contextName} Cleared</div>
        <div class="text-sm text-green-600">
          ${result.deletedCount || 0} pesan berhasil dihapus
        </div>
        <div class="text-xs text-green-500 mt-2">
          Hanya Anda yang melihat chat kosong ini
        </div>
      `;
      if (elements.messagesEl) elements.messagesEl.appendChild(successMsg);
      
      // PERBAIKAN: JANGAN reload context - biarkan tetap kosong
      // Hapus semua pesan dari UI
      const allMessages = document.querySelectorAll('.message:not(.system-message)');
      allMessages.forEach(msg => msg.remove());
      
      // Scroll ke bawah
      setTimeout(() => {
        if (elements.messagesEl) {
          elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
        }
      }, 100);
      
      console.log('✅ Chat cleared successfully');
      
    } else {
      // Tampilkan error
      const errorMsg = document.createElement("div");
      errorMsg.className = "system-message error text-center p-4 bg-red-50 border border-red-200 rounded-xl mb-3";
      errorMsg.innerHTML = `
        <div class="text-red-700 font-medium mb-1">❌ Gagal Membersihkan Chat</div>
        <div class="text-sm text-red-600">${result.error || "Unknown error"}</div>
      `;
      if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
      
      // Reload context untuk menampilkan pesan kembali
      setTimeout(() => setContext(state.currentContext), 1000);
    }
  } catch (err) {
    console.error("Clear chat error:", err);
    
    // Tampilkan error
    const errorMsg = document.createElement("div");
    errorMsg.className = "system-message error text-center p-4 bg-red-50 border border-red-200 rounded-xl mb-3";
    errorMsg.innerHTML = `
      <div class="text-red-700 font-medium mb-1">❌ Error</div>
      <div class="text-sm text-red-600">Terjadi error saat membersihkan chat</div>
    `;
    if (elements.messagesEl) elements.messagesEl.appendChild(errorMsg);
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

    // PERBAIKAN: Cek apakah chat ini baru saja dibersihkan
  const shouldBlockMessages = 
    state.lastClearedAt && 
    Date.now() - state.lastClearedAt < 10000 && // Dalam 10 detik terakhir
    (
      (data.message && data.message.room_id && state.currentContext.type === "room" && 
       data.message.room_id === state.currentContext.roomId) ||
      (data.message && data.message.recipient_id && state.currentContext.type === "private" &&
       (data.message.recipient_id === state.currentContext.userId || 
        data.message.sender_id === state.currentContext.userId))
    );
  
  if (shouldBlockMessages) {
    console.log('🚫 Blocking WS message karena chat baru dibersihkan');
    return;
  }

  switch (data.type) {
    case "init":
      if (data.rooms) renderRooms(data.rooms, setContext);
      // Tidak render users di sini karena sekarang pakai contacts
      break;

    case "room_created":
      loadInit();
      break;

    case "global_message":
      // PERBAIKAN: Cek apakah global chat sudah dibersihkan
      if (state.currentContext.type === "global") {
        const contextKey = "global_global";
        const wasClearedRecently = state.clearedContexts && 
                                  state.clearedContexts[contextKey] && 
                                  Date.now() - state.clearedContexts[contextKey] < 30 * 60 * 1000;
        
        if (wasClearedRecently) {
          console.log('🚫 Global chat was cleared, but allowing NEW messages');
          // Tetap render pesan baru yang datang via WebSocket
        }
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
      console.log('📄 [WS] File message received:', data.message);
      
      // DEBUG: Log semua detail message
      console.log('🔍 Message details:', {
        id: data.message.id,
        sender_id: data.message.sender_id,
        myId: myId,
        type: data.message.file_type,
        url: data.message.file_url,
        room_id: data.message.room_id,
        recipient_id: data.message.recipient_id,
        currentContext: state.currentContext
      });
      
      // Cek apakah message ini milik saya
      const isMyFileMessage = data.message.sender_id == myId;
      
      // PERBAIKAN: Hapus optimistic messages HANYA jika ini adalah file message saya
      if (isMyFileMessage) {
        console.log('🎯 This is MY file message from server');
        
        // Hapus semua temporary messages
        const tempElements = document.querySelectorAll('[id^="message-temp_"]');
        tempElements.forEach(el => el.remove());
        
        // Hapus berdasarkan ID
        const allTemp = document.querySelectorAll('[id^="temp_"]');
        allTemp.forEach(el => {
          if (el.id.includes('image') || el.id.includes('voice')) {
            el.remove();
          }
        });
      }
      
      // PERBAIKAN: Cek apakah message ini cocok dengan context yang aktif
      const shouldRender = shouldShowMessageForContext(data.message);
      
      if (shouldRender) {
        console.log('✅ Rendering file message for current context');
        
        // Tambahkan username jika tidak ada
        if (!data.message.username) {
          data.message.username = data.message.sender_id == myId ? 
            myUsername : 
            (state.currentContext?.username || "Unknown");
        }
        
        // Pastikan file_type di-set
        if (!data.message.file_type && data.message.file_url) {
          const url = data.message.file_url.toLowerCase();
          if (url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            data.message.file_type = "image";
          } else if (url.match(/\.(webm|mp3|ogg|wav|m4a)$/)) {
            data.message.file_type = "voice";
          }
        }
        
        renderMessage(data.message);
      } else {
        console.log('❌ Not rendering - wrong context');
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

// Tambahkan di chat-main.js
async function debugVoiceMessages() {
  console.log('🔍 Debug voice messages...');
  
  try {
    const context = state.currentContext;
    let endpoint = '';
    
    if (context.type === "room") {
      endpoint = `${API_ROOT}/rooms/${context.roomId}/messages`;
    } else if (context.type === "private") {
      endpoint = `${API_ROOT}/private/${encodeURIComponent(myUsername)}/${encodeURIComponent(context.username)}`;
    } else {
      endpoint = `${API_ROOT}/messages/global`;
    }
    
    const res = await fetch(endpoint, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await res.json();
    console.log('📊 All messages from server:', data);
    
    // Filter hanya voice messages
    const voiceMessages = (data.messages || []).filter(m => 
      m.file_type === 'voice' || 
      (m.file_url && m.file_url.includes('.webm')) ||
      (m.file_url && m.file_url.includes('.mp3'))
    );
    
    console.log('🎤 Voice messages in database:', voiceMessages.length);
    voiceMessages.forEach((m, i) => {
      console.log(`${i+1}. ID: ${m.id}, Sender: ${m.username}, URL: ${m.file_url}`);
    });
    
  } catch (error) {
    console.error('Debug error:', error);
  }
}

// Ekspos ke window untuk debugging

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
  window.updateRecordingUI = updateRecordingUI;
  window.updateRecordTimer = updateRecordTimer;
  window.clearChat = clearChat;
  window.answerCall = answerCall;
  window.rejectCall = rejectCall;
  window.endCall = endCall;
  window.searchUsers = searchUsers;
  window.debugModalClose = debugModalClose;
  window.debugAllButtons = debugAllButtons;
  window.debugPendingRequests = debugPendingRequests;
  window.testPendingAPI = testPendingAPI;
  window.testRenderWithSample = testRenderWithSample;
  window.debugVoiceMessages = debugVoiceMessages;

  
  console.log('✅ Chat initialized');
}

// Fungsi untuk reset cleared state
function clearClearedState(contextKey) {
  if (state.clearedContexts && state.clearedContexts[contextKey]) {
    delete state.clearedContexts[contextKey];
    
    // Update sessionStorage
    try {
      sessionStorage.setItem('clearedContexts', JSON.stringify(state.clearedContexts));
    } catch (e) {
      console.warn('Failed to update sessionStorage:', e);
    }
    
    console.log(`✅ Cleared state removed for ${contextKey}`);
    
    // Reload context
    if (state.currentContext) {
      setContext(state.currentContext);
    }
  }
}

// Ekspos ke window
window.clearClearedState = clearClearedState;
window.debugClearChat = async function() {
  console.log('🔍 Debugging clear chat...');
  
  // 1. Cek current context
  console.log('Current context:', state.currentContext);
  console.log('Cleared contexts:', state.clearedContexts);
  
  // 2. Cek sessionStorage
  try {
    const saved = sessionStorage.getItem('clearedContexts');
    console.log('SessionStorage clearedContexts:', saved);
  } catch (e) {
    console.warn('Cannot read sessionStorage:', e);
  }
  
  // 3. Cek messages sebelum clear
  const messagesBefore = document.querySelectorAll('.message').length;
  console.log(`Messages before clear: ${messagesBefore}`);
  
  // 4. Test clear API
  const url = state.currentContext.type === "global" 
    ? `/api/chat/clear/global`
    : state.currentContext.type === "room"
    ? `/api/chat/clear/room/${state.currentContext.roomId}`
    : `/api/chat/clear/private/${state.currentContext.userId}`;
  
  console.log('Testing API:', url);
  
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });
    
    const result = await res.json();
    console.log('API Response:', result);
    
    if (result.success) {
      // Simpan di state dan sessionStorage
      const contextKey = `${state.currentContext.type}_${state.currentContext.roomId || state.currentContext.userId || 'global'}`;
      
      if (!state.clearedContexts) state.clearedContexts = {};
      state.clearedContexts[contextKey] = Date.now();
      
      try {
        sessionStorage.setItem('clearedContexts', JSON.stringify(state.clearedContexts));
        console.log(`✅ Saved to sessionStorage`);
      } catch (e) {
        console.warn('Failed to save to sessionStorage:', e);
      }
      
      console.log(`✅ Marked ${contextKey} as cleared`);
      
      // Clear UI
      clearMessages();
      
      // Show debug message
      const debugMsg = document.createElement("div");
      debugMsg.className = "system-message debug text-center p-4 bg-purple-50 border border-purple-200 rounded-xl mb-3";
      debugMsg.innerHTML = `
        <div class="text-purple-700 font-medium mb-1">🔧 Debug: Chat Cleared</div>
        <div class="text-sm text-purple-600">
          Context: ${contextKey}<br>
          Time: ${new Date().toLocaleTimeString()}<br>
          Deleted: ${result.deletedCount || 0} messages
        </div>
        <div class="mt-2 flex flex-col gap-1 items-center">
          <button onclick="clearClearedState('${contextKey}')" 
                  class="text-xs bg-green-500 text-white px-3 py-1 rounded">
            Reset Cleared State
          </button>
          <button onclick="location.reload()" 
                  class="text-xs bg-blue-500 text-white px-3 py-1 rounded">
            Refresh Page
          </button>
          <small class="text-gray-500 text-xs mt-1">
            Refresh page to test persistence
          </small>
        </div>
      `;
      if (elements.messagesEl) elements.messagesEl.appendChild(debugMsg);
      
      // Cek UI setelah clear
      setTimeout(() => {
        const messagesAfter = document.querySelectorAll('.message').length;
        const systemMessages = document.querySelectorAll('.system-message').length;
        console.log(`Messages after clear: ${messagesAfter} (${systemMessages} system messages)`);
      }, 500);
    }
    
  } catch (error) {
    console.error('Debug error:', error);
  }
};

// Ekspos ke window
window.debugClearChat = debugClearChat;

// Tambahkan fungsi untuk force reload context
async function forceReloadContext(skipClearedCheck = false) {
  if (!state.currentContext) return;
  
  console.log('🔄 Force reloading context...');
  
  // Reset cleared flag jika diminta
  if (skipClearedCheck && state.clearedContexts) {
    const contextKey = `${state.currentContext.type}_${state.currentContext.roomId || state.currentContext.userId || 'global'}`;
    delete state.clearedContexts[contextKey];
    console.log(`🗑️ Removed cleared flag for ${contextKey}`);
  }
  
  // Reload context
  await setContext(state.currentContext);
}

// Ekspos ke window
window.forceReloadContext = forceReloadContext;

// Start everything
init();