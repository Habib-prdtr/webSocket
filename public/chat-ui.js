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
  if (elements.messagesEl) {
    elements.messagesEl.innerHTML = "";
  }
}
// FIXED: Bubble chat positioning dengan Tailwind
export function renderMessage(m) {
  if (!elements.messagesEl) return;
  
  const bubble = document.createElement("div");
  
  // PERBAIKAN DISINI: Chat sendiri di KANAN, orang lain di KIRI
  const isMyMessage = m.sender_id === myId;
  
  // Tailwind classes untuk bubble chat
  if (isMyMessage) {
    // CHAT SENDIRI - DI KANAN (Warna biru)
    bubble.className = "message me max-w-[30%] self-end ml-auto bg-indigo-500 text-white rounded-tr-none rounded-2xl px-4 py-2 mb-2";
  } else {
    // CHAT ORANG LAIN - DI KIRI (Warna abu-abu)
    bubble.className = "message other max-w-[30%] self-start mr-auto bg-gray-200 text-gray-800 rounded-tl-none rounded-2xl px-4 py-2 mb-2";
  }
  
  // Author/username dengan Tailwind
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
    bubble.appendChild(img);
  }
  else if (m.file_type === "audio" || m.file_type === "voice") {
    const audio = document.createElement("audio");
    audio.src = fileUrl;
    audio.controls = true;
    audio.className = "mt-1";
    bubble.appendChild(audio);
  }
  else {
    const txt = document.createElement("div");
    txt.textContent = m.content;
    txt.className = "message-text";
    bubble.appendChild(txt);
  }

  // Tambahkan timestamp dengan Tailwind
  const time = document.createElement("div");
  time.className = "message-time text-xs mt-1 opacity-75 text-right";
  const timestamp = m.created_at ? new Date(m.created_at) : new Date();
  time.textContent = timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  bubble.appendChild(time);

  elements.messagesEl.appendChild(bubble);
  scrollToBottom();
}

export function shouldShowMessageForContext(m) {
  console.log('🔍 CHECKING MESSAGE CONTEXT:', {
    currentContext: state.currentContext,
    message: {
      room_id: m.room_id,
      recipient_id: m.recipient_id,
      sender_id: m.sender_id
    }
  });

  if (state.currentContext.type === "global") {
    const shouldShow = !m.room_id && !m.recipient_id;
    console.log('🌍 GLOBAL CHECK:', shouldShow);
    return shouldShow;
  }
  
  if (state.currentContext.type === "room") {
    const shouldShow = Number(m.room_id) === Number(state.currentContext.roomId);
    console.log('🏠 ROOM CHECK:', shouldShow);
    return shouldShow;
  }
  
  if (state.currentContext.type === "private") {
    const other = Number(state.currentContext.userId);
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
    elements.pendingRequestsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center
                  text-center gap-2 py-8
                  bg-red-50 dark:bg-red-900/20
                  rounded-xl border border-red-200 dark:border-red-700">
        <p class="text-red-600 dark:text-red-400 font-semibold">
          Invalid data format
        </p>
        <small class="text-xs text-red-500 dark:text-red-300">
          ${typeof requests}
        </small>
      </div>
    `;
    return;
  }
  
  if (requests.length === 0) {
    console.log('ℹ️ No pending requests');
    elements.pendingRequestsEl.innerHTML = `
      <div class="flex flex-col items-center justify-center
                  py-10 text-center gap-2">
        <p class="text-slate-400 text-sm">
          🎉 No pending requests
        </p>
      </div>
    `;
    return;
  }
  
  console.log(`🔄 Rendering ${requests.length} request(s)`);
  
  requests.forEach((request, index) => {
    console.log(`📝 Processing request ${index}:`, request);
    
    // CREATE ELEMENT
    const el = document.createElement("div");
    el.className = "requestItem";
    el.style.border = "2px solid blue"; // DEBUG border
    el.style.padding = "10px";
    el.style.margin = "10px 0";
    el.style.background = "#f0f8ff";
    
    // EXTRACT DATA CAREFULLY
    const requestId = request.id || request.request_id || index;
    const username = request.username || 
                     request.requester_username || 
                     `User ${request.user_id || 'Unknown'}`;
    
    console.log(`📋 Extracted data - ID: ${requestId}, Username: ${username}`);
    
    // SIMPLE HTML - No complex formatting
    el.innerHTML = `
    <div class="flex items-center justify-between w-full
                p-4 rounded-xl
                bg-white/80 dark:bg-slate-800
                shadow hover:shadow-md transition">

      <!-- INFO -->
      <div>
        <div class="font-semibold text-base text-slate-800 dark:text-white">
          ${username}
        </div>

        <div class="text-sm text-slate-500">
          wants to connect
        </div>

        <div class="text-xs text-slate-400 mt-1">
          Request ID: ${requestId}
        </div>
      </div>

      <!-- ACTIONS -->
      <div class="flex gap-2">
        <button
          class="test-accept-btn
                bg-green-500 hover:bg-green-600
                text-white text-sm
                px-3 py-1 rounded-lg
                transition"
          data-id="${requestId}">
          Accept
        </button>

        <button
          class="test-reject-btn
                bg-red-500 hover:bg-red-600
                text-white text-sm
                px-3 py-1 rounded-lg
                transition"
          data-id="${requestId}">
          Reject
        </button>
      </div>

    </div>
  `;

    
    // ADD SIMPLE EVENT LISTENERS
    const acceptBtn = el.querySelector('.test-accept-btn');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log(`🎯 ACCEPT clicked for request ${this.dataset.id}`);
        alert(`Accept request ${this.dataset.id} from ${username}`);
        
        if (window.acceptContactRequest) {
          window.acceptContactRequest(this.dataset.id);
        }
      });
    }
    
    const rejectBtn = el.querySelector('.test-reject-btn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        console.log(`🎯 REJECT clicked for request ${this.dataset.id}`);
        alert(`Reject request ${this.dataset.id} from ${username}`);
        
        if (window.rejectContactRequest) {
          window.rejectContactRequest(this.dataset.id);
        }
      });
    }
    
    // APPEND TO CONTAINER
    elements.pendingRequestsEl.appendChild(el);
    console.log(`✅ Appended request ${index} to container`);
  });
  
  console.log('🎉 FINISHED renderPendingRequests');
  console.log('Container children:', elements.pendingRequestsEl.children.length);
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
    elements.btnVoice.textContent = "Send";
    elements.btnVoice.classList.add("recording");
    elements.recordPopup.classList.remove("hidden");
  } else {
    elements.btnVoice.textContent = "🎤";
    elements.btnVoice.classList.remove("recording");
    elements.recordPopup.classList.add("hidden");
  }
}

export function updateRecordTimer(time) {
  if (!elements.recordTimerEl) return;
  
  const m = Math.floor(time / 60);
  const s = String(time % 60).padStart(2, "0");
  elements.recordTimerEl.textContent = `${m}:${s}`;
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
  if (elements.pendingBadgeEl) {
    elements.pendingBadgeEl.textContent = count;
    elements.pendingBadgeEl.style.display = count > 0 ? 'inline-block' : 'none';
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
  
  if (elements.btnCancelRecord) {
    elements.btnCancelRecord.addEventListener("click", () => {
      if (window.stopRecording) window.stopRecording(true);
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

// ==================== DEBUG FUNCTIONS ====================
// ==================== DEBUG FUNCTIONS ====================
export function debugModalClose() {
  console.log('=== DEBUG MODAL CLOSE ===');
  
  const closeBtn = document.getElementById('btnCloseModal');
  console.log('Close button found:', !!closeBtn);
  console.log('Close button element:', closeBtn);
  
  if (closeBtn) {
    console.log('Testing click...');
    
    // Test 1: Direct click
    closeBtn.click();
    
    // Test 2: Manual trigger
    setTimeout(() => {
      console.log('Manual trigger after 500ms...');
      const event = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      closeBtn.dispatchEvent(event);
    }, 500);
  } else {
    console.error('❌ Close button not found by ID');
    
    // Cari semua tombol ×
    const allButtons = document.querySelectorAll('button');
    allButtons.forEach(btn => {
      if (btn.textContent.includes('×')) {
        console.log('Found × button:', btn);
        console.log('Clicking it...');
        btn.click();
      }
    });
  }
  
  // Test fungsi close
  console.log('Testing closeAddContactModal function...');
  if (typeof closeAddContactModal === 'function') {
    closeAddContactModal();
  } else {
    console.error('❌ closeAddContactModal function not found');
  }
}

export function debugAllButtons() {
  console.log('=== DEBUG ALL BUTTONS ===');
  const buttons = document.querySelectorAll('button');
  console.log(`Total buttons: ${buttons.length}`);
  
  buttons.forEach((btn, i) => {
    console.log(`${i}: ${btn.id || 'no-id'} - "${btn.textContent.trim()}"`);
    
    // Check event listeners jika function tersedia
    if (typeof getEventListeners === 'function') {
      const listeners = getEventListeners(btn);
      if (listeners && listeners.click) {
        console.log(`   Click listeners: ${listeners.click.length}`);
      }
    }
  });
}

export function debugElements() {
  console.log('=== DEBUG ALL ELEMENTS ===');
  Object.keys(elements).forEach(key => {
    const element = elements[key];
    if (element) {
      console.log(`✅ ${key}:`, element.tagName, element.id || 'no-id');
    } else {
      console.log(`❌ ${key}: NOT FOUND`);
    }
  });
}

export function testModalManually() {
  console.log('=== MANUAL MODAL TEST ===');
  
  // Show modal
  showAddContactModal();
  
  // Wait and try to close
  setTimeout(() => {
    console.log('Attempting to close modal...');
    
    // Method 1: Direct function call
    closeAddContactModal();
    
    // Method 2: Click close button if exists
    const closeBtn = document.getElementById('btnCloseModal');
    if (closeBtn) {
      console.log('Found close button, clicking...');
      closeBtn.click();
    }
    
    // Method 3: Simulate Escape key
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }, 1000);
}