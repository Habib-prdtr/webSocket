// chat-ui.js
import { state, myId, myUsername } from './chat-config.js';

// DOM Elements
export const elements = {
  meInfoEl: document.getElementById("meInfo"),
  meNameEl: document.getElementById("meName"),
  roomsListEl: document.getElementById("roomsList"),
  usersListEl: document.getElementById("usersList"),
  messagesEl: document.getElementById("messages"),
  chatTitleEl: document.getElementById("chatTitle"),
  chatSubtitleEl: document.getElementById("chatSubtitle"),
  msgInputEl: document.getElementById("messageInput"),
  btnSend: document.getElementById("btnSend"),
  btnCreateRoom: document.getElementById("btnCreateRoom"),
  newRoomNameEl: document.getElementById("newRoomName"),
  btnLogout: document.getElementById("btnLogout"),
  btnClearChat: document.getElementById("btnClearChat"),
  btnImage: document.getElementById("btnImage"),
  btnVoice: document.getElementById("btnVoice"),
  imageInputEl: document.getElementById("imageInput"),
  recordPopup: document.getElementById("recordPopup"),
  recordTimerEl: document.getElementById("recordTimer"),
  btnCancelRecord: document.getElementById("btnCancelRecord"),
  
  // Call UI Elements
  callContainer: document.getElementById("callContainer"),
  callStatus: document.getElementById("callStatus"),
  btnAnswerCall: document.getElementById("btnAnswerCall"),
  btnRejectCall: document.getElementById("btnRejectCall"),
  btnEndCall: document.getElementById("btnEndCall"),
  localAudio: document.getElementById("localAudio"),
  remoteAudio: document.getElementById("remoteAudio"),
  callerName: document.getElementById("callerName"),
  
  // Contacts UI Elements
  contactsListEl: document.getElementById("contactsList"),
  pendingRequestsEl: document.getElementById("pendingRequests"),
  pendingBadgeEl: document.getElementById("pendingBadge"),
  btnAddContact: document.getElementById("btnAddContact"),
  btnSearchContacts: document.getElementById("btnSearchContacts"),
  addContactModal: document.getElementById("addContactModal"),
  searchContactInput: document.getElementById("searchContactInput"),
  btnSearchContact: document.getElementById("btnSearchContact"),
  searchResultsEl: document.getElementById("searchResults"),
  btnCloseModal: document.getElementById("btnCloseModal"),
  
  // Tab elements
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content')
};

// Inisialisasi UI
export function initUI() {
  if (elements.meNameEl) elements.meNameEl.textContent = myUsername;
  if (elements.meInfoEl) elements.meInfoEl.textContent = `id: ${myId}`;
  
  // Setup tabs
  if (elements.tabBtns) {
    // Hapus event listener lama
    elements.tabBtns.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });
    
    // Ambil element baru setelah clone
    const freshTabBtns = document.querySelectorAll('.tab-btn');
    
    freshTabBtns.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const tab = this.dataset.tab;
        
        // Update active tab button styling
        freshTabBtns.forEach(b => {
          b.classList.remove('active');
          b.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
          b.classList.add('text-slate-500');
        });
        
        this.classList.add('active');
        this.classList.remove('text-slate-500');
        this.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');
        
        // Hide ALL tab contents
        const allTabContents = document.querySelectorAll('[id$="TabContent"]');
        allTabContents.forEach(c => {
          c.classList.add('hidden');
          c.classList.remove('active');
        });
        
        // Show selected tab content
        let contentId = `${tab}TabContent`;
        
        const tabContent = document.getElementById(contentId);
        if (tabContent) {
          tabContent.classList.remove('hidden');
          tabContent.classList.add('active');
        }
        
        // Load data for selected tab
        if (tab === 'requests' && window.loadPendingRequests) {
          setTimeout(() => window.loadPendingRequests(), 100);
        } else if (tab === 'contacts' && window.loadContacts) {
          setTimeout(() => window.loadContacts(), 100);
        }
      });
    });
    
    // Set initial active tab (rooms)
    const roomsTab = document.querySelector('.tab-btn[data-tab="rooms"]');
    if (roomsTab) {
      roomsTab.click();
    }
  }
}

// Message rendering
export function scrollToBottom() {
  if (elements.messagesEl) {
    elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
  }
}

export function clearMessages() {
  if (!elements.messagesEl) return;
  
  while (elements.messagesEl.firstChild) {
    elements.messagesEl.removeChild(elements.messagesEl.firstChild);
  }
}

export function renderMessage(m) {
   if (!elements.messagesEl || !m) return;
  
  const messageId = m.id || m._id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // CEGAH DOUBLE RENDER: Periksa apakah pesan sudah ada
  // Periksa berdasarkan ID atau kombinasi timestamp + sender + content
  const existingMsg = document.getElementById(`message-${messageId}`);
  
  // Untuk pesan temp, hanya tampilkan jika belum ada pesan dengan ID yang sama
  // Untuk pesan non-temp, cek juga berdasarkan waktu dan konten
  if (existingMsg) {
    // Jika pesan sudah ada dan bukan pesan sementara, skip render
    if (!m.is_temp && !m.is_optimistic) {
      return;
    }
    
    // Untuk pesan temp, jika sudah ada versi permanen (non-temp), hapus temp
    if (m.is_temp && existingMsg.dataset.permanent === 'true') {
      existingMsg.remove();
    } else if (!m.is_temp && existingMsg) {
      // Update temp dengan pesan permanen
      existingMsg.dataset.permanent = 'true';
      return;
    }
  }
  
  const bubble = document.createElement("div");
  bubble.id = `message-${messageId}`;
  if (!m.is_temp && !m.is_optimistic) {
    bubble.dataset.permanent = 'true';
  }
  
  const isMyMessage = m.sender_id == myId;
  const messageType = m.file_type || 'text';
  
  const isVoice = messageType === "voice" || messageType === "audio";
  
  if (isMyMessage) {
    bubble.className = "message me max-w-[40%] self-end ml-auto bg-indigo-500 text-white rounded-tr-none rounded-2xl px-4 py-3 mb-3 shadow-sm";
  } else {
    bubble.className = "message other max-w-[40%] self-start mr-auto bg-white border border-slate-200 text-slate-800 rounded-tl-none rounded-2xl px-4 py-3 mb-3 shadow-sm";
  }
  
  // Header dengan username dan waktu
  const header = document.createElement("div");
  header.className = "flex items-center justify-between mb-2";
  
  const usernameSpan = document.createElement("span");
  usernameSpan.className = "text-xs font-semibold opacity-90";
  usernameSpan.textContent = isMyMessage ? "You" : (m.username || "Unknown");
  
  const timeSpan = document.createElement("span");
  timeSpan.className = "text-xs opacity-75";
  try {
    const timestamp = m.created_at ? new Date(m.created_at) : new Date();
    timeSpan.textContent = timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch {
    timeSpan.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
  
  header.appendChild(usernameSpan);
  header.appendChild(timeSpan);
  bubble.appendChild(header);
  
  // Konten pesan
  const fileUrl = m.file_url || m.file_path;
  
  if (messageType === "image") {
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "msg-image rounded-lg max-w-full h-auto";
    img.loading = "lazy";
    img.alt = "Shared image";
    bubble.appendChild(img);
  }
  else if (isVoice) {
    const audioContainer = document.createElement("div");
    audioContainer.className = "audio-container flex items-center gap-3";
    
    const audio = document.createElement("audio");
    audio.src = fileUrl;
    audio.controls = true;
    audio.preload = "metadata";
    audio.className = "flex-1 max-w-[200px]";
    
    audioContainer.appendChild(audio);
    bubble.appendChild(audioContainer);
  }
  else {
    const txt = document.createElement("div");
    txt.textContent = m.content || "";
    txt.className = "message-text whitespace-pre-wrap break-words";
    bubble.appendChild(txt);
  }
  
  elements.messagesEl.appendChild(bubble);
  
  if (!m.is_from_load) {
    setTimeout(() => {
      if (elements.messagesEl) {
        elements.messagesEl.scrollTop = elements.messagesEl.scrollHeight;
      }
    }, 50);
  }
}

export function shouldShowMessageForContext(message) {
  const currentContext = window.state?.currentContext;
  if (!currentContext) {
    return false;
  }

  // Global messages
  if (!message.room_id && !message.recipient_id && currentContext.type === "global") {
    return true;
  }

  // Room messages
  if (message.room_id && currentContext.type === "room" && 
      Number(message.room_id) === Number(currentContext.roomId)) {
    return true;
  }

  // Private messages
  if (message.recipient_id && currentContext.type === "private") {
    const messageRecipientId = Number(message.recipient_id);
    const messageSenderId = Number(message.sender_id);
    const currentUserId = Number(currentContext.userId);
    const myIdNum = Number(window.myId);
    
    const isFromMeToCurrent = (messageSenderId === myIdNum && messageRecipientId === currentUserId);
    const isFromCurrentToMe = (messageSenderId === currentUserId && messageRecipientId === myIdNum);
    
    if (isFromMeToCurrent || isFromCurrentToMe) {
      return true;
    }
    
    return false;
  }

  return false;
}

// Rooms rendering
export function renderRooms(list, setContextCallback) {
  if (!elements.roomsListEl) return;
  
  elements.roomsListEl.innerHTML = "";

  // Global room
  const globalItem = document.createElement("div");
  globalItem.className = "roomItem p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex items-center gap-3 border-b border-slate-100";
  globalItem.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
      <span class="text-indigo-600">🌍</span>
    </div>
    <div class="flex-1">
      <div class="font-semibold text-slate-800">Global</div>
      <div class="text-xs text-slate-400">Public chat</div>
    </div>
  `;
  globalItem.onclick = () => setContextCallback({ type: "global" });
  elements.roomsListEl.appendChild(globalItem);

  // Rooms list
  // list.forEach((room) => {
  //   const el = document.createElement("div");
  //   el.className = "roomItem p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex items-center gap-3 border-b border-slate-100 last:border-b-0";
    
  //   el.innerHTML = `
  //     <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
  //       <span class="text-slate-600">👥</span>
  //     </div>
  //     <div class="flex-1">
  //       <div class="font-semibold text-slate-800">${room.name}</div>
  //       <div class="text-xs text-slate-400">${room.member_count || 0} members</div>
  //     </div>
  //   `;
    
  //   el.onclick = () => setContextCallback({ 
  //     type: "room", 
  //     roomId: room.id, 
  //     name: room.name 
  //   });
    
  //   elements.roomsListEl.appendChild(el);
  // });
}

export function renderContacts(list, setContextCallback, startCallCallback) {
  if (!elements.contactsListEl) return;
  
  elements.contactsListEl.innerHTML = "";

  if (list.length === 0) {
    elements.contactsListEl.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center gap-3 py-10">
        <div class="text-4xl mb-2 text-slate-300">👤</div>
        <p class="text-slate-400 text-sm">No contacts yet</p>
        <button id="btnAddFirstContact" 
                class="bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-4 py-2 rounded-full transition shadow">
          Add your first contact
        </button>
      </div>
    `;
    return;
  }

  list.forEach((contact) => {
    const el = document.createElement("div");
    el.className = "contactItem p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors border-b border-slate-100 last:border-b-0";
    
    const contactId = contact.contact_id || contact.id;
    const username = contact.username || '';
    const isOnline = contact.is_online || false;
    
    // INI PENTING: Set dataset.online dengan benar
    el.dataset.contactId = contactId;
    el.dataset.username = username;
    el.dataset.online = isOnline.toString(); // Pastikan ini string "true" atau "false"
    
    console.log(`🖥️ Rendering contact ${username}: online=${isOnline}`);
    const lastSeen = contact.last_seen ? 
      new Date(contact.last_seen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
      '';
    
    el.dataset.contactId = contactId;
    el.dataset.username = username;
    el.dataset.online = isOnline.toString();
    
    el.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <!-- INFO SECTION -->
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <!-- Avatar -->
          <div class="relative">
            <div class="w-10 h-10 rounded-full ${isOnline ? 'bg-green-100' : 'bg-slate-100'} flex items-center justify-center">
              <span class="${isOnline ? 'text-green-600' : 'text-slate-400'} text-lg">👤</span>
            </div>
            <!-- Online indicator -->
            <div class="absolute bottom-0 right-0 w-3 h-3 ${isOnline ? 'bg-green-500' : 'bg-slate-400'} border-2 border-white rounded-full"></div>
          </div>
          
          <!-- User info -->
          <div class="flex flex-col flex-1 min-w-0">
            <div class="font-semibold text-slate-800 truncate">${username}</div>
            <div class="text-xs text-slate-400">
              ${isOnline ? 'Online now' : `Last seen ${lastSeen}`}
            </div>
          </div>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex gap-2 ml-3">
          <!-- Call button -->
          <button class="btn-call-contact action-btn ${isOnline ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}" 
                  data-contact-id="${contactId}"
                  ${!isOnline ? 'disabled' : ''}
                  title="${isOnline ? 'Call' : 'Offline'}">
            <span class="text-sm">📞</span>
          </button>
          
          <!-- Chat button -->
          <button class="btn-chat-contact action-btn bg-indigo-100 text-indigo-600 hover:bg-indigo-200" 
                  data-contact-id="${contactId}"
                  title="Chat">
            <span class="text-sm">💬</span>
          </button>
          
          <!-- Remove button -->
          <button class="btn-remove-contact action-btn bg-red-100 text-red-600 hover:bg-red-200" 
                  data-contact-id="${contactId}"
                  title="Remove contact">
            <span class="text-sm">🗑️</span>
          </button>
        </div>
      </div>
    `;
    
    elements.contactsListEl.appendChild(el);
  });
}

export function renderPendingRequests(requests) {
  if (!elements.pendingRequestsEl) {
    return;
  }
  
  elements.pendingRequestsEl.innerHTML = '';
  
  if (!requests || !Array.isArray(requests) || requests.length === 0) {
    elements.pendingRequestsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 text-center gap-2">
        <div class="text-3xl mb-2 text-slate-300">📨</div>
        <p class="text-slate-400 text-sm">No pending requests</p>
        <p class="text-xs text-slate-500">When someone sends you a request, it will appear here.</p>
      </div>
    `;
    return;
  }
  
  requests.forEach((request) => {
    const requestId = request.id || request.request_id;
    const username = request.username || request.requester_username || 'Unknown';
    const timeText = request.created_at ? formatTime(request.created_at) : 'Recently';
    
    const el = document.createElement("div");
    el.className = "requestItem mb-3";
    
    el.innerHTML = `
      <div class="flex items-center justify-between w-full p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:shadow transition-all">
        <!-- REQUEST INFO -->
        <div class="flex-1 min-w-0 mr-4">
          <div class="font-semibold text-slate-800 truncate text-base">
            ${username}
          </div>
          <div class="text-sm text-slate-500 mt-1">
            Wants to add you as a contact
          </div>
          <div class="text-xs text-slate-400 mt-1">
            ${timeText}
          </div>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex gap-2 flex-shrink-0">
          <button class="btn-accept-request bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition active:scale-95"
                  data-request-id="${requestId}"
                  data-username="${username}">
            Accept
          </button>
          <button class="btn-reject-request bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-lg transition active:scale-95"
                  data-request-id="${requestId}"
                  data-username="${username}">
            Reject
          </button>
        </div>
      </div>
    `;
    
    elements.pendingRequestsEl.appendChild(el);
  });
}

// Search results rendering
export function renderSearchResults(users) {
  if (!elements.searchResultsEl) return;
  
  elements.searchResultsEl.innerHTML = '';
  
  if (!users || users.length === 0) {
    elements.searchResultsEl.innerHTML = `
      <div class="flex items-center justify-center py-6 text-slate-400 text-sm">
        No users found
      </div>
    `;
    return;
  }
  
  users.forEach(user => {
    const el = document.createElement("div");
    el.className = "search-result-item flex items-center justify-between p-3 rounded-xl bg-white hover:bg-slate-50 transition border border-slate-100 mb-2";
    
    const isOnline = user.is_online || false;
    
    el.innerHTML = `
      <div class="flex items-center gap-3">
        <!-- Avatar -->
        <div class="relative">
          <div class="w-10 h-10 rounded-full ${isOnline ? 'bg-green-100' : 'bg-slate-100'} flex items-center justify-center">
            <span class="${isOnline ? 'text-green-600' : 'text-slate-400'}">👤</span>
          </div>
          <div class="absolute bottom-0 right-0 w-2 h-2 ${isOnline ? 'bg-green-500' : 'bg-slate-400'} border border-white rounded-full"></div>
        </div>
        
        <!-- User info -->
        <div class="flex flex-col">
          <div class="font-semibold text-slate-800">
            ${user.username}
          </div>
          <div class="text-xs ${isOnline ? 'text-green-500' : 'text-slate-400'}">
            ${isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      <!-- Add button -->
      <button class="btn-add-search bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg transition"
              data-username="${user.username}">
        Add
      </button>
    `;
    
    elements.searchResultsEl.appendChild(el);
  });
}

export function updateUserStatus(userId, isOnline) {
  const contactEls = document.querySelectorAll(`.contactItem[data-contact-id="${userId}"]`);
  
  contactEls.forEach(contactEl => {
    // Update data attribute
    contactEl.dataset.online = isOnline.toString();
    
    // Update avatar background
    const avatarDiv = contactEl.querySelector('.w-10.h-10.rounded-full');
    if (avatarDiv) {
      avatarDiv.className = `w-10 h-10 rounded-full ${isOnline ? 'bg-green-100' : 'bg-slate-100'} flex items-center justify-center`;
    }
    
    // Update online indicator dot
    const onlineDot = contactEl.querySelector('.absolute.bottom-0.right-0');
    if (onlineDot) {
      onlineDot.className = `absolute bottom-0 right-0 w-3 h-3 ${isOnline ? 'bg-green-500' : 'bg-slate-400'} border-2 border-white rounded-full`;
    }
    
    // Update status text
    const statusText = contactEl.querySelector('.text-xs.text-slate-400');
    if (statusText) {
      if (isOnline) {
        statusText.textContent = 'Online now';
      } else {
        const now = new Date();
        statusText.textContent = `Last seen ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      }
    }
    
    // Update call button - PERBAIKAN UTAMA DI SINI
    const callBtn = contactEl.querySelector('.btn-call-contact');
    if (callBtn) {
      if (isOnline) {
        // Enable call button
        callBtn.classList.remove('bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
        callBtn.classList.add('bg-green-100', 'text-green-600', 'hover:bg-green-200');
        callBtn.disabled = false;
        callBtn.title = 'Call';
        
        // Hapus atribut disabled
        callBtn.removeAttribute('disabled');
      } else {
        // Disable call button
        callBtn.classList.remove('bg-green-100', 'text-green-600', 'hover:bg-green-200');
        callBtn.classList.add('bg-slate-100', 'text-slate-400', 'cursor-not-allowed');
        callBtn.disabled = true;
        callBtn.title = 'Offline';
        
        // Tambah atribut disabled
        callBtn.setAttribute('disabled', 'disabled');
      }
    }
  });
  
  // Juga update di userList state
  if (state.userList) {
    const userIndex = state.userList.findIndex(u => u.id == userId || u.contact_id == userId);
    if (userIndex !== -1) {
      state.userList[userIndex].is_online = isOnline;
    }
  }
}

// Dalam chat-ui.js, ubah fungsi updateChatTitle:
export function updateChatTitle(title) {
  if (elements.chatTitleEl) elements.chatTitleEl.textContent = title;
}

function updateChatLatency(latency) {
  if (!state.currentContext || state.currentContext.type !== "private") return;
  
  // Update subtitle dengan latency
  const subtitleEl = document.getElementById("chatSubtitle");
  if (subtitleEl) {
    const latencyInfo = subtitleEl.querySelector('.latency-info');
    if (latencyInfo) {
      const latencyColor = latency < 100 ? 'text-green-500' : 
                         latency < 300 ? 'text-yellow-500' : 'text-red-500';
      latencyInfo.innerHTML = `
        <span class="${latencyColor} text-xs">●</span>
        <span class="text-xs">${latency}ms</span>
      `;
    } else {
      // Tambahkan latency info jika belum ada
      const latencyEl = document.createElement('div');
      latencyEl.className = 'latency-info flex items-center gap-1';
      const latencyColor = latency < 100 ? 'text-green-500' : 
                         latency < 300 ? 'text-yellow-500' : 'text-red-500';
      latencyEl.innerHTML = `
        <span class="${latencyColor} text-xs">●</span>
        <span class="text-xs">${latency}ms</span>
      `;
      
      const container = subtitleEl.querySelector('div');
      if (container) {
        container.appendChild(latencyEl);
      }
    }
  }
}

export function updateClearBtnVisibility() {
  if (elements.btnClearChat) {
    const showBtn = state.currentContext && 
                   (state.currentContext.type === "global" || 
                    state.currentContext.type === "room" || 
                    state.currentContext.type === "private");
    
    if (showBtn) {
      elements.btnClearChat.classList.remove('hidden');
    } else {
      elements.btnClearChat.classList.add('hidden');
    }
  }
}

// Recording UI
export function updateRecordingUI(started) {
  if (!elements.btnVoice || !elements.recordPopup) return;
  
  if (started) {
    elements.btnVoice.innerHTML = `
      <span class="animate-pulse">⏺️</span>
      <span class="text-xs ml-1">Stop</span>
    `;
    elements.btnVoice.classList.add("bg-red-100", "text-red-600");
    elements.btnVoice.classList.remove("hover:bg-slate-100");
    
    elements.recordPopup.classList.remove("hidden");
    
  } else {
    elements.btnVoice.innerHTML = "🎤";
    elements.btnVoice.classList.remove("bg-red-100", "text-red-600");
    elements.btnVoice.classList.add("hover:bg-slate-100");
    
    elements.recordPopup.classList.add("hidden");
  }
}

export function updateRecordTimer(time) {
  if (!elements.recordTimerEl) return;
  
  const minutes = Math.floor(time / 60);
  const seconds = String(time % 60).padStart(2, "0");
  elements.recordTimerEl.textContent = `${minutes}:${seconds}`;
  
  const progressBar = document.getElementById('recordProgress');
  if (progressBar) {
    const progress = Math.min((time / 120) * 100, 100);
    progressBar.style.width = `${progress}%`;
    progressBar.className = `h-full rounded-full ${progress > 80 ? 'bg-red-500' : 'bg-indigo-500'}`;
  }
}

// Call UI
export function showCallUI(status, isCaller = false) {
  if (!elements.callContainer || !elements.callStatus) return;
  
  elements.callContainer.style.display = 'block';
  elements.callStatus.textContent = status;
  
  if (elements.btnAnswerCall) {
    elements.btnAnswerCall.style.display = isCaller ? 'none' : 'inline-block';
  }
  if (elements.btnRejectCall) {
    elements.btnRejectCall.style.display = isCaller ? 'none' : 'inline-block';
  }
  if (elements.btnEndCall) {
    elements.btnEndCall.style.display = 'inline-block';
  }
}

export function hideCallUI() {
  if (elements.callContainer) {
    elements.callContainer.style.display = 'none';
  }
}

export function setCallerName(name) {
  if (elements.callerName) {
    elements.callerName.textContent = name;
  }
}

// Contacts Modal
export function showAddContactModal() {
  if (elements.addContactModal) {
    elements.addContactModal.classList.remove("hidden");
    if (elements.searchContactInput) {
      elements.searchContactInput.focus();
    }
  }
}

export function closeAddContactModal() {
  if (elements.addContactModal) {
    elements.addContactModal.classList.add("hidden");
    
    if (elements.searchResultsEl) {
      elements.searchResultsEl.innerHTML = `
        <div class="flex items-center justify-center py-8 text-slate-400 text-sm">
          Search results will appear here
        </div>
      `;
    }
    
    if (elements.searchContactInput) {
      elements.searchContactInput.value = '';
    }
  }
}

export function updatePendingBadge(count) {
  let badge = document.getElementById('pendingBadge');
  
  if (!badge) {
    const requestsTab = document.querySelector('[data-tab="requests"]');
    if (!requestsTab) return;
    
    badge = document.createElement('span');
    badge.id = 'pendingBadge';
    badge.className = 'pending-badge absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold px-1.5 rounded-full flex items-center justify-center transform transition-all duration-300 scale-0 opacity-0 shadow-lg border-2 border-white';
    badge.textContent = '0';
    
    requestsTab.appendChild(badge);
  }
  
  badge.textContent = count;
  
  if (count > 0) {
    badge.classList.remove('hidden', 'scale-0', 'opacity-0');
    badge.classList.add('flex', 'scale-100', 'opacity-100');
    
    badge.classList.add('animate-ping', 'animate-once');
    setTimeout(() => {
      badge.classList.remove('animate-ping', 'animate-once');
    }, 500);
  } else {
    badge.classList.add('hidden', 'scale-0', 'opacity-0');
    badge.classList.remove('flex', 'scale-100', 'opacity-100');
  }
}

// Helper function
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

export function setupStaticEventListeners() {
  // Send message
  if (elements.btnSend) {
    elements.btnSend.addEventListener("click", () => {
      if (window.sendMessage) window.sendMessage();
    });
  }
  
  // Enter key in message input
  if (elements.msgInputEl) {
    elements.msgInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (window.sendMessage) window.sendMessage();
      }
    });
  }
  
  // Create room
  if (elements.btnCreateRoom) {
    elements.btnCreateRoom.addEventListener("click", () => {
      if (window.createRoom) window.createRoom();
    });
  }
  
  // Logout
  if (elements.btnLogout) {
    elements.btnLogout.addEventListener("click", () => {
      if (window.logout) window.logout();
    });
  }
  
  // Image upload
  if (elements.btnImage) {
    elements.btnImage.addEventListener("click", () => {
      if (elements.imageInputEl) elements.imageInputEl.click();
    });
  }
  
  if (elements.imageInputEl) {
    elements.imageInputEl.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      
      if (window.uploadFile) await window.uploadFile(file);
      e.target.value = "";
    });
  }
  
  // Voice recording
  if (elements.btnVoice) {
    elements.btnVoice.addEventListener("click", async () => {
      if (!state.isRecording) {
        if (window.startRecording) window.startRecording();
      } else {
        if (window.finishRecording) window.finishRecording();
      }
    });
  }
  
  // Cancel record
  if (elements.btnCancelRecord) {
    elements.btnCancelRecord.addEventListener("click", () => {
      if (window.stopRecording) window.stopRecording(true);
    });
  }
  
  // Send record button
  const btnSendRecord = document.getElementById('btnSendRecord');
  if (btnSendRecord) {
    btnSendRecord.addEventListener("click", () => {
      if (window.finishRecording) window.finishRecording();
    });
  }
  
  // Clear chat
  if (elements.btnClearChat) {
    elements.btnClearChat.addEventListener("click", () => {
      if (window.clearChat) window.clearChat();
    });
  }
  
  // Call buttons
  if (elements.btnAnswerCall) {
    elements.btnAnswerCall.addEventListener("click", () => {
      if (window.answerCall) window.answerCall();
    });
  }
  
  if (elements.btnRejectCall) {
    elements.btnRejectCall.addEventListener("click", () => {
      if (window.rejectCall) window.rejectCall();
    });
  }
  
  if (elements.btnEndCall) {
    elements.btnEndCall.addEventListener("click", () => {
      if (window.endCall) window.endCall();
    });
  }
  
  // Add contact button
  if (elements.btnAddContact) {
    elements.btnAddContact.addEventListener("click", function(e) {
      showAddContactModal();
    });
  }
  
  // Search contacts button
  if (elements.btnSearchContacts) {
    elements.btnSearchContacts.addEventListener("click", function(e) {
      showAddContactModal();
    });
  }
  
  // Close modal button
  if (elements.btnCloseModal) {
    const newCloseBtn = elements.btnCloseModal.cloneNode(true);
    elements.btnCloseModal.parentNode.replaceChild(newCloseBtn, elements.btnCloseModal);
    elements.btnCloseModal = newCloseBtn;
    
    elements.btnCloseModal.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeAddContactModal();
    });
  }
  
  // Click outside modal
  if (elements.addContactModal) {
    elements.addContactModal.addEventListener("click", function(e) {
      if (e.target === this) {
        closeAddContactModal();
      }
    });
  }
  
  // Search button in modal
  if (elements.btnSearchContact) {
    elements.btnSearchContact.addEventListener("click", () => {
      if (window.searchUsers) {
        window.searchUsers();
      }
    });
  }
  
  // Search input enter key
  if (elements.searchContactInput) {
    elements.searchContactInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (window.searchUsers) {
          window.searchUsers();
        }
      }
    });
  }
}

export function setupEventDelegation() {
  // chat-ui.js - Perbaiki handler tombol call:
if (elements.contactsListEl) {
  elements.contactsListEl.addEventListener('click', function(e) {
    const target = e.target;
    const contactItem = target.closest('.contactItem');
    
    if (!contactItem) return;
    
    const contactId = contactItem.dataset.contactId;
    const username = contactItem.dataset.username;
    
    // TOMBOL CALL - PERBAIKAN UTAMA
    if (target.classList.contains('btn-call-contact') || target.closest('.btn-call-contact')) {
      e.stopPropagation();
      e.preventDefault();
      
      // Cek status dari STATE, bukan hanya dari dataset
      const stateOnline = state.userStatuses[contactId];
      const datasetOnline = contactItem.dataset.online === 'true';
      const isOnline = stateOnline !== undefined ? stateOnline : datasetOnline;
      
      console.log('📞 Call button clicked:', { 
        contactId, 
        username, 
        datasetOnline, 
        stateOnline,
        finalIsOnline: isOnline 
      });
      
      if (isOnline && window.startCall && contactId) {
        console.log('✅ Starting call to:', username);
        window.startCall(contactId);
      } else {
        // Jika offline, refresh dulu baru coba lagi
        const refresh = confirm(`${username} appears offline. Refresh status?`);
        if (refresh && window.refreshUserStatus) {
          window.refreshUserStatus(contactId).then(newStatus => {
            if (newStatus) {
              alert(`${username} is now online! You can call now.`);
            } else {
              alert(`${username} is still offline.`);
            }
          });
        } else {
          alert(`${username} is offline. Cannot make call.`);
        }
      }
      return;
    }
      
      // Tombol chat contact
      if (target.classList.contains('btn-chat-contact') || target.closest('.btn-chat-contact')) {
        e.stopPropagation();
        
        if (window.setContext && contactId && username) {
          window.setContext({
            type: "private",
            userId: contactId,
            username: username
          });
        }
        return;
      }
      
      // Tombol remove contact
      if (target.classList.contains('btn-remove-contact') || target.closest('.btn-remove-contact')) {
        e.stopPropagation();
        
        if (confirm(`Remove ${username} from contacts?`)) {
          if (window.removeContact && contactId) {
            window.removeContact(contactId);
          }
        }
        return;
      }
      
      // Click pada contact item (untuk chat)
      if (!target.closest('.action-btn')) {
        if (window.setContext && contactId && username) {
          window.setContext({
            type: "private",
            userId: contactId,
            username: username
          });
        }
      }
    });
  }
  
  // Delegasi untuk pending requests
  if (elements.pendingRequestsEl) {
    elements.pendingRequestsEl.addEventListener('click', function(e) {
      const target = e.target;
      
      // Accept button
      if (target.classList.contains('btn-accept-request') || target.closest('.btn-accept-request')) {
        const button = target.classList.contains('btn-accept-request') ? target : target.closest('.btn-accept-request');
        const requestId = button.dataset.requestId;
        
        e.stopPropagation();
        
        if (window.acceptContactRequest && requestId) {
          window.acceptContactRequest(requestId);
        }
        return;
      }
      
      // Reject button
      if (target.classList.contains('btn-reject-request') || target.closest('.btn-reject-request')) {
        const button = target.classList.contains('btn-reject-request') ? target : target.closest('.btn-reject-request');
        const requestId = button.dataset.requestId;
        
        e.stopPropagation();
        
        if (window.rejectContactRequest && requestId) {
          window.rejectContactRequest(requestId);
        }
        return;
      }
    });
  }
  
  // Delegasi untuk search results
  if (elements.searchResultsEl) {
    elements.searchResultsEl.addEventListener('click', function(e) {
      const target = e.target;
      
      if (target.classList.contains('btn-add-search') || target.closest('.btn-add-search')) {
        const button = target.classList.contains('btn-add-search') ? target : target.closest('.btn-add-search');
        const username = button.dataset.username;
        
        e.stopPropagation();
        
        if (window.sendContactRequest && username) {
          window.sendContactRequest(username).then(result => {
            if (result && result.success) {
              closeAddContactModal();
            }
          });
        }
        return;
      }
    });
  }
  
  // Global delegation untuk close modal buttons
  document.addEventListener('click', function(e) {
    if (e.target.id === 'btnCloseModal' || 
        e.target.textContent.trim() === '×' ||
        (e.target.tagName === 'BUTTON' && e.target.textContent.includes('×'))) {
      e.preventDefault();
      e.stopPropagation();
      closeAddContactModal();
      return;
    }
    
    if (e.target.id === 'addContactModal') {
      closeAddContactModal();
      return;
    }
  });
}

export function setupEventListenerss() {
  setupStaticEventListeners();
  setupEventDelegation();
}