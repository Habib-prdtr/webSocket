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
// Inisialisasi UI - FIXED VERSION
// Inisialisasi UI - FIXED VERSION
export function initUI() {
  if (elements.meNameEl) elements.meNameEl.textContent = myUsername;
  if (elements.meInfoEl) elements.meInfoEl.textContent = `id: ${myId}`;
  
  // Setup tabs - FIXED FOR YOUR HTML STRUCTURE
  if (elements.tabBtns) {
    console.log('🔧 Setting up tab system...');
    
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
        console.log(`📑 Switching to tab: ${tab}`);
        
        // 1. Update active tab button styling
        freshTabBtns.forEach(b => {
          b.classList.remove('active');
          b.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
          b.classList.add('text-slate-500');
        });
        
        this.classList.add('active');
        this.classList.remove('text-slate-500');
        this.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');
        
        // 2. Hide ALL tab contents
        const allTabContents = document.querySelectorAll('[id$="TabContent"]');
        allTabContents.forEach(c => {
          c.classList.add('hidden');
          c.classList.remove('active');
        });
        
        // 3. Show selected tab content - SESUAI HTML ANDA
        let contentId = `${tab}TabContent`; // SEMUA PAKE "Content" DI AKHIR
        
        const tabContent = document.getElementById(contentId);
        if (tabContent) {
          console.log(`✅ Found content: ${contentId}`);
          tabContent.classList.remove('hidden');
          tabContent.classList.add('active');
        } else {
          console.error(`❌ Tab content not found: ${contentId}`);
        }
        
        // 4. Load data for selected tab
        if (tab === 'requests' && window.loadPendingRequests) {
          console.log('🔄 Loading requests data...');
          setTimeout(() => window.loadPendingRequests(), 100);
        } else if (tab === 'contacts' && window.loadContacts) {
          console.log('🔄 Loading contacts data...');
          setTimeout(() => window.loadContacts(), 100);
        } else if (tab === 'rooms') {
          console.log('🔄 Rooms tab selected');
        }
      });
    });
    
    // 5. Set initial active tab (rooms)
    const roomsTab = document.querySelector('.tab-btn[data-tab="rooms"]');
    if (roomsTab) {
      console.log('🎯 Activating rooms tab');
      roomsTab.click(); // Trigger click event
    } else {
      console.error('❌ Rooms tab button not found!');
    }
  } else {
    console.error('❌ Tab buttons not found in DOM');
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
  
  // PERBAIKAN: Hapus semua children
  while (elements.messagesEl.firstChild) {
    elements.messagesEl.removeChild(elements.messagesEl.firstChild);
  }
  
  // Atau alternatif yang lebih cepat
  // elements.messagesEl.innerHTML = "";
  
  console.log('🧹 All messages cleared from UI');
}
// FIXED: Bubble chat positioning dengan Tailwind
export function renderMessage(m) {
  if (!elements.messagesEl) return;
  
  // Cek apakah message sudah ada (untuk menghindari duplikat)
  const existingMsg = document.getElementById(`message-${m.id}`);
  if (existingMsg && !m.is_optimistic) {
    console.log(`⚠️ Message ${m.id} already exists, skipping`);
    return;
  }
  
  const bubble = document.createElement("div");
  
  // Gunakan ID yang konsisten
  bubble.id = `message-${m.id || m.temp_id}`;
  
  const isMyMessage = m.sender_id === myId;
  
  if (isMyMessage) {
    bubble.className = "message me max-w-[30%] self-end ml-auto bg-indigo-500 text-white rounded-tr-none rounded-2xl px-4 py-2 mb-2";
  } else {
    bubble.className = "message other max-w-[30%] self-start mr-auto bg-gray-200 text-gray-800 rounded-tl-none rounded-2xl px-4 py-2 mb-2";
  }
  
  // Author
  const author = document.createElement("div");
  author.className = "author text-xs font-medium mb-1";
  author.textContent = isMyMessage ? "You" : (m.username || "Unknown");
  bubble.appendChild(author);

  // Konten pesan
  const fileUrl = m.file_url || m.file_path;
  
  if (m.file_type === "image") {
    const img = document.createElement("img");
    img.src = fileUrl;
    img.className = "msg-image rounded-lg max-w-full";
    img.loading = "lazy";
    bubble.appendChild(img);
  }
  else if (m.file_type === "audio" || m.file_type === "voice") {
    // PERBAIKAN: Audio player yang lebih baik
    const audioContainer = document.createElement("div");
    audioContainer.className = "audio-container flex items-center gap-2";
    
    const audio = document.createElement("audio");
    audio.src = fileUrl;
    audio.controls = true;
    audio.preload = "metadata";
    audio.className = "flex-1";
    
    // Indikator untuk voice message
    const voiceIndicator = document.createElement("span");
    voiceIndicator.className = "text-xs opacity-75";
    
    audioContainer.appendChild(voiceIndicator);
    audioContainer.appendChild(audio);
    bubble.appendChild(audioContainer);
  }
  else {
    const txt = document.createElement("div");
    txt.textContent = m.content;
    txt.className = "message-text";
    bubble.appendChild(txt);
  }

  // Timestamp
  const time = document.createElement("div");
  time.className = "message-time text-xs mt-1 opacity-75 text-right";
  const timestamp = m.created_at ? new Date(m.created_at) : new Date();
  time.textContent = timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  bubble.appendChild(time);

  // Status indicator (untuk optimistic messages)
  if (m.is_optimistic) {
    const status = document.createElement("div");
    status.className = "text-xs italic opacity-75 mt-1";
    bubble.appendChild(status);
  }

  elements.messagesEl.appendChild(bubble);
  scrollToBottom();
}
export function shouldShowMessageForContext(message) {
  console.log('🔍 Checking message context:', {
    message: message,
    currentContext: window.state?.currentContext,
    myId: window.myId
  });
  
  const currentContext = window.state?.currentContext;
  if (!currentContext) {
    console.log('❌ No current context');
    return false;
  }

  // Untuk global messages
  if (!message.room_id && !message.recipient_id && currentContext.type === "global") {
    console.log('✅ Global message match');
    return true;
  }

  // Untuk room messages
  if (message.room_id && currentContext.type === "room" && 
      message.room_id === currentContext.roomId) {
    console.log('✅ Room message match');
    return true;
  }

  // Untuk private messages
  if (message.recipient_id && currentContext.type === "private") {
    // Check jika message adalah untuk current user
    const isMessageToMe = message.recipient_id === myId;
    const isMessageFromMe = message.sender_id === myId;
    const isCurrentUser = currentContext.userId === message.sender_id || 
                         currentContext.userId === message.recipient_id;
    
    console.log('🔍 Private message check:', {
      isMessageToMe,
      isMessageFromMe,
      isCurrentUser,
      currentUserId: currentContext.userId,
      messageRecipientId: message.recipient_id,
      messageSenderId: message.sender_id
    });
    
    if ((isMessageToMe && currentContext.userId === message.sender_id) ||
        (isMessageFromMe && currentContext.userId === message.recipient_id)) {
      console.log('✅ Private message match');
      return true;
    }
  }

  console.log('❌ No context match');
  return false;
}

// Rooms rendering
export function renderRooms(list, setContextCallback) {
  if (!elements.roomsListEl) return;
  
  elements.roomsListEl.innerHTML = "";

  // Global
  const g = document.createElement("div");
  g.className = "roomItem";
  g.textContent = "Global";
  g.onclick = () => setContextCallback({ type: "global" });
  elements.roomsListEl.appendChild(g);

  list.forEach((r) => {
    const el = document.createElement("div");
    el.className = "roomItem";
    el.textContent = r.name;
    el.onclick = () => setContextCallback({ 
      type: "room", 
      roomId: r.id, 
      name: r.name 
    });
    elements.roomsListEl.appendChild(el);
  });
}

export function renderContacts(list, setContextCallback, startCallCallback) {
  if (!elements.contactsListEl) return;
  
  elements.contactsListEl.innerHTML = "";

  if (list.length === 0) {
    elements.contactsListEl.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center gap-3 py-10">
        <p class="text-slate-400 text-sm">No contacts yet</p>
        <button id="btnAddFirstContact" class="bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-4 py-2 rounded-full transition shadow">
          Add your first contact
        </button>
      </div>
    `;
    return;
  }

  list.forEach((contact) => {
    const el = document.createElement("div");
    el.className = "contactItem p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors border-b border-slate-100 last:border-b-0";
    el.setAttribute('data-contact-id', contact.contact_id || contact.id);
    
    // SIMPAN DATA DI DATASET - INI YANG PENTING
    el.dataset.contactId = contact.contact_id || contact.id;
    el.dataset.username = contact.username || '';
    
    const lastSeen = contact.last_seen ? 
      new Date(contact.last_seen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
      '';
    
    const isOnline = contact.is_online || false;
    
    el.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <!-- INFO -->
        <div class="flex flex-col flex-1 min-w-0 mr-3">
          <div class="font-semibold text-slate-800 truncate contact-username" data-username="${contact.username}">
            ${contact.username}
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <span class="inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-slate-400'}"></span>
            <span class="contact-status">${isOnline ? 'Online' : `Last seen ${lastSeen}`}</span>
          </div>
        </div>

        <!-- ACTIONS -->
        <div class="flex gap-2">
          <button class="btn-call-contact ${isOnline ? 'bg-green-500 hover:bg-green-600' : 'bg-slate-300 cursor-not-allowed'} text-white text-sm px-3 py-1 rounded-lg transition" 
                  data-contact-id="${contact.contact_id || contact.id}"
                  ${!isOnline ? 'disabled' : ''}
                  title="${isOnline ? 'Call' : 'Offline'}">
            📞
          </button>
          <button class="btn-remove-contact bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded-lg transition" 
                  data-contact-id="${contact.contact_id || contact.id}"
                  title="Remove contact">
            🗑️
          </button>
        </div>
      </div>
    `;
    
    elements.contactsListEl.appendChild(el);
  });
}

// PENDING REQUESTS RENDERING - SUPER DEBUG VERSION
export function renderPendingRequests(requests) {
  console.log('🎯 START renderPendingRequests');
  console.log('📥 Input requests:', requests);
  
  if (!elements.pendingRequestsEl) {
    console.error('❌ pendingRequestsEl not found!');
    return;
  }
  
  console.log('✅ Found pendingRequestsEl:', elements.pendingRequestsEl);
  
  // Clear container
  elements.pendingRequestsEl.innerHTML = '';
  
  // Check if requests is valid
  if (!requests || !Array.isArray(requests)) {
    console.error('❌ requests is not array:', requests);
    console.log('Type of requests:', typeof requests);
    
    // Coba convert jika itu object
    if (requests && typeof requests === 'object') {
      console.log('🔍 Trying to extract array from object...');
      
      // Cek berbagai kemungkinan property
      const possibleKeys = ['pending', 'requests', 'data', 'items', 'list'];
      for (const key of possibleKeys) {
        if (requests[key] && Array.isArray(requests[key])) {
          console.log(`✅ Found array in "${key}", re-rendering...`);
          return renderPendingRequests(requests[key]);
        }
      }
    }
    
    elements.pendingRequestsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center
                  text-center gap-2 py-8
                  bg-yellow-50 rounded-xl border border-yellow-200">
        <p class="text-yellow-600 font-semibold">
          Invalid data format
        </p>
        <small class="text-xs text-yellow-500">
          Type: ${typeof requests}
        </small>
        <button onclick="window.debugPendingRequests && window.debugPendingRequests(${JSON.stringify(requests)})" 
                class="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-sm">
          Debug Data
        </button>
      </div>
    `;
    return;
  }
  
  if (requests.length === 0) {
    console.log('ℹ️ No pending requests');
    elements.pendingRequestsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center
                  py-10 text-center gap-2">
        <div class="text-2xl mb-2">🎉</div>
        <p class="text-slate-400 text-sm">
          No pending requests
        </p>
        <p class="text-xs text-slate-500">
          When someone sends you a contact request, it will appear here.
        </p>
      </div>
    `;
    return;
  }
  
  console.log(`🔄 Rendering ${requests.length} request(s)`);
  
  // Hapus debug styles untuk production
  requests.forEach((request, index) => {
    const el = document.createElement("div");
    el.className = "requestItem mb-3";
    
    // EXTRACT DATA dengan lebih robust
    const requestId = request.id || request.request_id || request._id || index;
    const username = request.username || 
                     request.requester_username || 
                     request.sender_username ||
                     request.from_username ||
                     `User ${request.user_id || request.sender_id || 'Unknown'}`;
    
    // Format waktu
    const createdAt = request.created_at || request.timestamp || request.date;
    const timeText = createdAt ? formatTime(createdAt) : 'Recently';
    
    console.log(`📋 Request ${index}:`, { requestId, username, timeText });
    
    // HTML yang lebih baik
    el.innerHTML = `
    <div class="flex items-center justify-between w-full
                p-4 rounded-xl
                bg-white border border-slate-200
                shadow-sm hover:shadow-md transition-all">

      <!-- INFO -->
      <div class="flex-1 min-w-0 mr-4">
        <div class="font-semibold text-base text-slate-800 truncate">
          ${username}
        </div>
        
        <div class="text-sm text-slate-500 mt-1">
          Sent you a contact request
        </div>
        
        <div class="text-xs text-slate-400 mt-1">
          ${timeText}
        </div>
      </div>

      <!-- ACTIONS -->
      <div class="flex gap-2 flex-shrink-0">
        <button
          class="btn-accept-request
                bg-emerald-500 hover:bg-emerald-600
                text-white text-sm font-medium
                px-4 py-2 rounded-lg
                transition active:scale-95"
          data-request-id="${requestId}"
          data-username="${username}">
          Accept
        </button>

        <button
          class="btn-reject-request
                bg-rose-500 hover:bg-rose-600
                text-white text-sm font-medium
                px-4 py-2 rounded-lg
                transition active:scale-95"
          data-request-id="${requestId}"
          data-username="${username}">
          Reject
        </button>
      </div>

    </div>
  `;
    
    // Event listeners
    const acceptBtn = el.querySelector('.btn-accept-request');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const requestId = this.dataset.requestId;
        const username = this.dataset.username;
        
        console.log(`✅ ACCEPT clicked for request ${requestId} from ${username}`);
        
        if (window.acceptContactRequest) {
          window.acceptContactRequest(requestId);
        } else {
          alert(`Accept request from ${username}`);
        }
      });
    }
    
    const rejectBtn = el.querySelector('.btn-reject-request');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const requestId = this.dataset.requestId;
        const username = this.dataset.username;
        
        console.log(`❌ REJECT clicked for request ${requestId} from ${username}`);
        
        if (window.rejectContactRequest) {
          window.rejectContactRequest(requestId);
        } else {
          alert(`Reject request from ${username}`);
        }
      });
    }
    
    elements.pendingRequestsEl.appendChild(el);
  });
  
  console.log('🎉 FINISHED renderPendingRequests');
  console.log('Rendered items:', elements.pendingRequestsEl.children.length);
}

// SEARCH RESULTS RENDERING
export function renderSearchResults(users) {
  if (!elements.searchResultsEl) return;
  
  elements.searchResultsEl.innerHTML = '';
  
  if (users.length === 0) {
  elements.searchResultsEl.innerHTML = `
    <div class="flex items-center justify-center
                py-6 text-slate-400 text-sm">
      No users found
    </div>
  `;
    return;
  }
  
  users.forEach(user => {
    const el = document.createElement("div");
    el.className = `
      search-result-item
      flex items-center justify-between
      p-3 rounded-xl
      bg-white/80 dark:bg-slate-800
      hover:bg-slate-100 dark:hover:bg-slate-700
      transition
    `;

    el.innerHTML = `
      <div class="flex flex-col">
        <div class="font-semibold text-slate-800 dark:text-white">
          ${user.username}
        </div>

        <div class="text-xs flex items-center gap-2
                    ${user.is_online ? 'text-green-500' : 'text-slate-400'}">
          <span class="w-2 h-2 rounded-full
                      ${user.is_online ? 'bg-green-500' : 'bg-slate-400'}"></span>
          ${user.is_online ? 'Online' : 'Offline'}
        </div>
      </div>

      <button
        class="btn-add-search
              bg-indigo-500 hover:bg-indigo-600
              text-white text-sm
              px-3 py-1 rounded-lg
              transition"
        data-username="${user.username}">
        Add
      </button>
    `;
    const addBtn = el.querySelector('.btn-add-search');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        if (window.sendContactRequest) {
          const result = await window.sendContactRequest(user.username);
          if (result && result.success) {
            if (window.closeAddContactModal) window.closeAddContactModal();
          }
        }
      });
    }
    
    elements.searchResultsEl.appendChild(el);
  });
}

export function updateUserStatus(userId, isOnline) {
  // Update di contacts list
  const contactEls = document.querySelectorAll(`.contactItem[data-contact-id="${userId}"]`);
  
  contactEls.forEach(contactEl => {
    // Update status dot
    const statusDot = contactEl.querySelector('.w-2.h-2.rounded-full');
    if (statusDot) {
      statusDot.className = `inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-slate-400'}`;
    }
    
    // Update status text
    const statusText = contactEl.querySelector('.contact-status');
    if (statusText) {
      if (isOnline) {
        statusText.textContent = 'Online';
      } else {
        const now = new Date();
        statusText.textContent = `Last seen ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      }
    }
    
    // Update call button
    const callBtn = contactEl.querySelector('.btn-call-contact');
    if (callBtn) {
      if (isOnline) {
        callBtn.classList.remove('bg-slate-300', 'cursor-not-allowed');
        callBtn.classList.add('bg-green-500', 'hover:bg-green-600');
        callBtn.disabled = false;
        callBtn.title = 'Call';
      } else {
        callBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        callBtn.classList.add('bg-slate-300', 'cursor-not-allowed');
        callBtn.disabled = true;
        callBtn.title = 'Offline';
      }
    }
  });
}

export function updateChatTitle(title, subtitle) {
  if (elements.chatTitleEl) elements.chatTitleEl.textContent = title;
  if (elements.chatSubtitleEl) elements.chatSubtitleEl.textContent = subtitle;
}

export function updateClearBtnVisibility() {
  if (elements.btnClearChat) {
    if (state.currentContext.type === "global" || 
        state.currentContext.type === "room" || 
        state.currentContext.type === "private") {
      elements.btnClearChat.style.display = "inline-block";
    } else {
      elements.btnClearChat.style.display = "none";
    }
  }
}

// Recording UI
export function updateRecordingUI(started) {
  if (!elements.btnVoice || !elements.recordPopup) return;
  
  if (started) {
    // Ubah tombol voice di chat input
    elements.btnVoice.innerHTML = `
      <span class="animate-pulse">⏺️</span>
      <span class="text-xs ml-1">Stop</span>
    `;
    elements.btnVoice.classList.add("bg-red-100", "text-red-600");
    elements.btnVoice.classList.remove("hover:bg-slate-100");
    
    // Tampilkan popup recording
    elements.recordPopup.classList.remove("hidden");
    
    // Reset progress bar
    const progressBar = document.getElementById('recordProgress');
    if (progressBar) {
      progressBar.style.width = '0%';
    }
    
  } else {
    // Kembalikan tombol voice ke semula
    elements.btnVoice.innerHTML = "🎤";
    elements.btnVoice.classList.remove("bg-red-100", "text-red-600");
    elements.btnVoice.classList.add("hover:bg-slate-100");
    
    // Sembunyikan popup
    elements.recordPopup.classList.add("hidden");
  }
}

export function updateRecordTimer(time) {
  if (!elements.recordTimerEl) return;
  
  const minutes = Math.floor(time / 60);
  const seconds = String(time % 60).padStart(2, "0");
  elements.recordTimerEl.textContent = `${minutes}:${seconds}`;
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
// Contacts Modal - PERBAIKAN
export function showAddContactModal() {
  console.log('🟡 showAddContactModal called');
  
  if (elements.addContactModal) {
    elements.addContactModal.classList.remove("hidden");
    if (elements.searchContactInput) {
      elements.searchContactInput.focus();
    }
    console.log('✅ Modal shown');
  } else {
    console.error('❌ addContactModal element not found!');
  }
}

export function closeAddContactModal() {
  console.log('🟡 closeAddContactModal called');
  
  if (elements.addContactModal) {
    elements.addContactModal.classList.add("hidden");
    
    if (elements.searchResultsEl) {
      elements.searchResultsEl.innerHTML = `
        <div class="flex items-center justify-center py-8 text-gray-400 text-sm">
          Search results will appear here
        </div>
      `;
    }
    
    if (elements.searchContactInput) {
      elements.searchContactInput.value = '';
    }
    console.log('✅ Modal hidden');
  }
}

export function updatePendingBadge(count) {
  console.log('🔴 UPDATE BADGE dengan count:', count);
  
  // Cari badge
  let badge = document.getElementById('pendingBadge');
  
  if (!badge) {
    console.log('🔍 Badge tidak ditemukan, membuat baru...');
    badge = createBadgeElement();
  }
  
  console.log('✅ Badge ditemukan:', badge);
  console.log('📌 Text sekarang:', badge.textContent);
  
  // Update count
  badge.textContent = count;
  
  // Show/hide berdasarkan count
  if (count > 0) {
    console.log(`🎯 Menampilkan badge dengan angka ${count}`);
    
    // TAMPILKAN badge
    badge.classList.remove('hidden', 'scale-0', 'opacity-0');
    badge.classList.add('flex', 'scale-100', 'opacity-100');
    
    // Tambahkan class untuk animasi
    badge.classList.add('animate-ping', 'animate-once');
    
    // Hapus animasi setelah selesai
    setTimeout(() => {
      badge.classList.remove('animate-ping', 'animate-once');
    }, 500);
    
  } else {
    console.log('👁️‍🗨️ Menyembunyikan badge (count = 0)');
    
    // SEMBUNYIKAN badge
    badge.classList.add('hidden', 'scale-0', 'opacity-0');
    badge.classList.remove('flex', 'scale-100', 'opacity-100');
  }
  
  console.log('✅ Badge diperbarui. Text baru:', badge.textContent);
  console.log('✅ Classes badge sekarang:', badge.className);
}

// Fungsi bantu untuk membuat badge jika tidak ada
function createBadgeElement() {
  const requestsTab = document.querySelector('[data-tab="requests"]');
  if (!requestsTab) {
    console.error('❌ Tab Requests tidak ditemukan');
    return null;
  }
  
  const badge = document.createElement('span');
  badge.id = 'pendingBadge';
  badge.className = 'absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold px-1.5 rounded-full flex items-center justify-center transform transition-all duration-300 scale-0 opacity-0 shadow-lg border-2 border-white';
  badge.textContent = '0';
  
  requestsTab.appendChild(badge);
  console.log('✅ Badge baru dibuat');
  
  return badge;
}

// Helper function
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

/// PERBAIKAN DISINI: Fix event listeners untuk tombol Add Contact
// Setup event listeners untuk STATIC ELEMENTS
export function setupStaticEventListeners() {
  console.log('🔧 Setting up STATIC event listeners...');
  
  // 1. TOMBOL STATIC YANG SELALU ADA
  if (elements.btnSend) {
    console.log('✅ Found send button');
    elements.btnSend.addEventListener("click", () => {
      if (window.sendMessage) window.sendMessage();
    });
  }
  
  if (elements.msgInputEl) {
    elements.msgInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (window.sendMessage) window.sendMessage();
      }
    });
  }
  
  if (elements.btnCreateRoom) {
    elements.btnCreateRoom.addEventListener("click", () => {
      if (window.createRoom) window.createRoom();
    });
  }
  
  if (elements.btnLogout) {
    elements.btnLogout.addEventListener("click", () => {
      if (window.logout) window.logout();
    });
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
      if (window.uploadFile) await window.uploadFile(file);
      e.target.value = "";
    });
  }
  
  // Voice recording buttons
  if (elements.btnVoice) {
    elements.btnVoice.addEventListener("click", async () => {
      if (!state.isRecording) {
        if (window.startRecording) window.startRecording();
      } else {
        if (window.finishRecording) window.finishRecording();
      }
    });
  }
  
  // Cancel record button
  if (elements.btnCancelRecord) {
    elements.btnCancelRecord.addEventListener("click", () => {
      console.log('❌ Cancel recording clicked');
      if (window.stopRecording) window.stopRecording(true);
    });
  }
  
  // Send record button (NEW)
  const btnSendRecord = document.getElementById('btnSendRecord');
  if (btnSendRecord) {
    btnSendRecord.addEventListener("click", () => {
      console.log('✅ Send recording clicked');
      if (window.finishRecording) window.finishRecording();
    });
  }
  
  // Clear chat button
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
  
  // 2. TOMBOL ADD CONTACT (STATIC) - INI YANG PERLU DIPERBAIKI
  if (elements.btnAddContact) {
    console.log('✅ Found Add Contact button (static)');
    elements.btnAddContact.addEventListener("click", function(e) {
      console.log('🟡 Add Contact button clicked! (static listener)');
      showAddContactModal();
    });
  }
  
  // Search contacts button di sidebar
  if (elements.btnSearchContacts) {
    console.log('✅ Found Search Contacts button');
    elements.btnSearchContacts.addEventListener("click", function(e) {
      console.log('🟡 Search Contacts button clicked!');
      showAddContactModal();
    });
  }
  
  // ==================== TOMBOL CLOSE MODAL (×) ====================
  // PERBAIKAN DISINI: Tambahkan debug dan event listener yang benar
  if (elements.btnCloseModal) {
    console.log('✅ Found Close Modal button (×)');
    console.log('Close button element:', elements.btnCloseModal);
    
    // Remove any existing listeners first
    const newCloseBtn = elements.btnCloseModal.cloneNode(true);
    elements.btnCloseModal.parentNode.replaceChild(newCloseBtn, elements.btnCloseModal);
    elements.btnCloseModal = newCloseBtn;
    
    // Add new listener
    elements.btnCloseModal.addEventListener("click", function(e) {
      console.log('❌ Close Modal button clicked! (via event listener)');
      e.preventDefault();
      e.stopPropagation();
      closeAddContactModal();
    });
    
    // Also add inline onclick as backup
    elements.btnCloseModal.onclick = function(e) {
      console.log('❌ Close Modal button clicked! (via onclick)');
      e.preventDefault();
      e.stopPropagation();
      closeAddContactModal();
      return false;
    };
  } else {
    console.error('❌ btnCloseModal element not found!');
    console.log('Trying to find by text content...');
    
    // Cari semua tombol yang mengandung ×
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => {
      if (btn.textContent.trim() === '×') {
        console.log('Found × button:', btn);
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          closeAddContactModal();
        });
      }
    });
  }
  
  // Click outside modal to close
  if (elements.addContactModal) {
    console.log('✅ Setting up click outside modal listener');
    elements.addContactModal.addEventListener("click", function(e) {
      console.log('🟡 Modal background clicked');
      if (e.target === this) {
        console.log('✅ Clicked outside modal, closing...');
        closeAddContactModal();
      }
    });
  }
  
  // Search button in modal
  if (elements.btnSearchContact) {
    console.log('✅ Found Search Contact button');
    elements.btnSearchContact.addEventListener("click", () => {
      console.log('🔍 Search button clicked');
      if (window.searchUsers) {
        window.searchUsers();
      } else {
        console.error('❌ searchUsers function not available');
      }
    });
  }
  
  // Search input enter key
  if (elements.searchContactInput) {
    elements.searchContactInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        console.log('🔍 Enter key pressed in search');
        if (window.searchUsers) {
          window.searchUsers();
        }
      }
    });
  }
  
  console.log('✅ Static event listeners setup completed');
}

// EVENT DELEGATION untuk DYNAMIC ELEMENTS
export function setupEventDelegation() {
  console.log('🔧 Setting up EVENT DELEGATION...');

  // 1. Delegasi untuk kontak list - HANYA INI YANG MENANGANI
  if (elements.contactsListEl) {
    // Hapus event listener lama
    elements.contactsListEl.replaceWith(elements.contactsListEl.cloneNode(true));
    elements.contactsListEl = document.getElementById("contactsList");
    
    elements.contactsListEl.addEventListener('click', function(e) {
      const target = e.target;
      const contactItem = target.closest('.contactItem');
      
      if (!contactItem) {
        // Tombol "Add your first contact"
        if (target.id === 'btnAddFirstContact' || target.closest('#btnAddFirstContact')) {
          console.log('🟡 Add First Contact button clicked');
          e.stopPropagation();
          showAddContactModal();
        }
        return;
      }
      
      const contactId = contactItem.dataset.contactId;
      const username = contactItem.dataset.username || 
                      contactItem.querySelector('[data-username]')?.getAttribute('data-username') ||
                      contactItem.querySelector('.contact-username')?.textContent?.trim() || '';
      
      // Tombol call contact
      if (target.classList.contains('btn-call-contact') || target.closest('.btn-call-contact')) {
        console.log('📞 Call contact clicked:', contactId);
        e.stopPropagation();
        
        const isOnline = !target.disabled;
        if (isOnline && window.startCall && contactId) {
          window.startCall(contactId);
        }
        return;
      }
      
      // Tombol remove contact
      if (target.classList.contains('btn-remove-contact') || target.closest('.btn-remove-contact')) {
        console.log('🗑️ Remove contact clicked:', contactId);
        e.stopPropagation();
        
        if (confirm(`Remove ${username} from contacts?`)) {
          if (window.removeContact && contactId) {
            window.removeContact(contactId);
          }
        }
        return;
      }
      
      // Click pada contact item (bukan tombol)
      console.log('💬 Contact clicked for chat:', { contactId, username });
      
      if (window.setContext && contactId && username) {
        window.setContext({
          type: "private",
          userId: contactId,
          username: username.trim()
        });
      }
    });
  }

  // ==================== DELEGASI UNTUK MODAL CLOSE ====================
  // Backup: delegasi global untuk tombol close
  document.addEventListener('click', function(e) {
    // Tombol close modal (×)
    if (e.target.id === 'btnCloseModal' || 
        e.target.textContent.trim() === '×' ||
        (e.target.tagName === 'BUTTON' && e.target.textContent.includes('×'))) {
      console.log('❌ Close button clicked via GLOBAL delegation');
      e.preventDefault();
      e.stopPropagation();
      
      if (window.closeAddContactModal) {
        window.closeAddContactModal();
      } else {
        // Fallback langsung
        const modal = document.getElementById('addContactModal');
        if (modal) {
          modal.classList.add('hidden');
          console.log('✅ Modal hidden via fallback');
        }
      }
      return;
    }
    
    // Click outside modal
    if (e.target.id === 'addContactModal') {
      console.log('🟡 Clicked modal background via GLOBAL delegation');
      if (window.closeAddContactModal) {
        window.closeAddContactModal();
      }
      return;
    }
  });
  
  // 1. Delegasi untuk kontak list (contactsListEl)
  if (elements.contactsListEl) {
    elements.contactsListEl.addEventListener('click', function(e) {
      const target = e.target;
      
      // Tombol "Add your first contact" (dynamic)
      if (target.id === 'btnAddFirstContact' || target.closest('#btnAddFirstContact')) {
        console.log('🟡 Add First Contact button clicked (delegation)');
        showAddContactModal();
        return;
      }
      
      // Tombol call contact
      if (target.classList.contains('btn-call-contact') || target.closest('.btn-call-contact')) {
        e.stopPropagation();
        const contactId = target.dataset.contactId || target.closest('.btn-call-contact').dataset.contactId;
        console.log('📞 Call contact clicked:', contactId);
        
        if (window.startCall && contactId) {
          window.startCall(contactId);
        }
        return;
      }
      
      // Tombol remove contact
      if (target.classList.contains('btn-remove-contact') || target.closest('.btn-remove-contact')) {
        e.stopPropagation();
        const contactId = target.dataset.contactId || target.closest('.btn-remove-contact').dataset.contactId;
        const contactElement = target.closest('.contactItem');
        const username = contactElement?.querySelector('.font-semibold')?.textContent || 'this contact';
        
        console.log('🗑️ Remove contact clicked:', contactId);
        
        if (confirm(`Remove ${username} from contacts?`)) {
          if (window.removeContact && contactId) {
            window.removeContact(contactId);
          }
        }
        return;
      }
      
      // Click pada contact item untuk chat (bukan tombol)
      if (target.closest('.contactItem') && !target.closest('.btn-call-contact') && !target.closest('.btn-remove-contact')) {
        const contactElement = target.closest('.contactItem');
        const contactId = contactElement?.getAttribute('data-contact-id');
        const username = contactElement?.querySelector('.font-semibold')?.textContent;
        
        console.log('💬 Contact clicked for chat:', contactId, username);
        
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
  
  // 2. Delegasi untuk pending requests
  if (elements.pendingRequestsEl) {
    elements.pendingRequestsEl.addEventListener('click', function(e) {
      const target = e.target;
      
      // Accept button
      if (target.classList.contains('test-accept-btn') || target.closest('.test-accept-btn')) {
        e.stopPropagation();
        const requestId = target.dataset.id || target.closest('.test-accept-btn')?.dataset.id;
        console.log('✅ Accept request clicked:', requestId);
        
        if (window.acceptContactRequest && requestId) {
          window.acceptContactRequest(requestId);
        }
        return;
      }
      
      // Reject button
      if (target.classList.contains('test-reject-btn') || target.closest('.test-reject-btn')) {
        e.stopPropagation();
        const requestId = target.dataset.id || target.closest('.test-reject-btn')?.dataset.id;
        console.log('❌ Reject request clicked:', requestId);
        
        if (window.rejectContactRequest && requestId) {
          window.rejectContactRequest(requestId);
        }
        return;
      }
    });
  }
  
  // 3. Delegasi untuk search results
  if (elements.searchResultsEl) {
    elements.searchResultsEl.addEventListener('click', function(e) {
      const target = e.target;
      
      // Add button di search results
      if (target.classList.contains('btn-add-search') || target.closest('.btn-add-search')) {
        const username = target.dataset.username || target.closest('.btn-add-search')?.dataset.username;
        console.log('➕ Add contact from search clicked:', username);
        
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
  
  console.log('✅ Event delegation setup completed');
}

// Fungsi utama untuk setup semua event listeners
export function setupEventListenerss() {
  console.log('🚀 SETUP EVENT LISTENERS STARTED');
  setupStaticEventListeners();
  setupEventDelegation();
  console.log('🎉 SETUP EVENT LISTENERS COMPLETED');
}
