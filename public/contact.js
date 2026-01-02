// contacts.js - Sistem Kontak WhatsApp-style
import { API_ROOT, token, state } from './chat-config.js';
import { elements, updateUserStatus } from './chat-ui.js';

export let contacts = [];

// DOM Elements untuk kontak
const contactsListEl = document.getElementById("contactsList");
const pendingRequestsEl = document.getElementById("pendingRequests");
const pendingBadgeEl = document.getElementById("pendingBadge");
const searchContactInput = document.getElementById("searchContactInput");
const btnSearchContact = document.getElementById("btnSearchContact");
const searchResultsEl = document.getElementById("searchResults");
const addContactModal = document.getElementById("addContactModal");
const btnAddContact = document.getElementById("btnAddContact");
const btnCloseModal = document.getElementById("btnCloseModal");

// Tab switching - HAPUS INI (sudah ada di chat-ui.js)
// document.querySelectorAll('.tab-btn').forEach(btn => {
//     btn.addEventListener('click', () => {
//         const tab = btn.dataset.tab;
        
//         // Update active tab
//         document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
//         document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
//         btn.classList.add('active');
//         document.getElementById(`${tab}Tab`).classList.add('active');
        
//         // Jika tab requests, load pending requests
//         if (tab === 'requests') {
//             loadPendingRequests();
//         }
//     });
// });

// Load contacts
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
        contacts = data.contacts || [];
        renderContacts();
        
        // Update userList di state untuk kompatibilitas
        state.userList = contacts.map(c => ({
            id: c.contact_id || c.id,
            username: c.username,
            is_online: c.is_online,
            last_seen: c.last_seen
        }));
        
        return contacts;
    } catch (error) {
        console.error('Error loading contacts:', error);
        return [];
    }
}

// Render contacts list
export function renderContacts() {
    if (!contactsListEl) return;
    
    contactsListEl.innerHTML = '';
    
    if (contacts.length === 0) {
        contactsListEl.innerHTML = `
        <div class="flex flex-col items-center justify-center
                    text-center gap-3 py-10">
            <p class="text-slate-400 text-sm">
            No contacts yet
            </p>
            <button
            id="btnAddFirstContact"
            class="bg-indigo-500 hover:bg-indigo-600
                    text-white text-sm
                    px-4 py-2 rounded-full
                    transition shadow">
            Add your first contact
            </button>
        </div>
        `;

        
        document.getElementById('btnAddFirstContact')?.addEventListener('click', () => {
            showAddContactModal();
        });
        return;
    }
    
    contacts.forEach(contact => {
        const el = document.createElement("div");
        el.className = "contactItem";
        el.setAttribute('data-contact-id', contact.contact_id || contact.id);
        
        const lastSeen = contact.last_seen ? 
            new Date(contact.last_seen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
            '';
        
        el.innerHTML = `
            <div class="flex items-center justify-between w-full">

                <!-- INFO -->
                <div class="flex flex-col">
                <div class="font-semibold text-slate-800 dark:text-white">
                    ${contact.username}
                </div>

                <div class="flex items-center gap-2 text-xs text-slate-400">
                    <span
                    class="w-2 h-2 rounded-full
                            ${contact.is_online ? 'bg-green-500' : 'bg-slate-400'}">
                    </span>

                    <span>
                    ${contact.is_online ? 'Online' : `Last seen ${lastSeen}`}
                    </span>
                </div>
                </div>

                <!-- ACTIONS -->
                <div class="flex gap-2">
                <button
                    class="btn-call-contact
                        ${contact.is_online
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-slate-300 cursor-not-allowed'}
                        text-white text-sm
                        px-3 py-1 rounded-lg transition"
                    data-contact-id="${contact.contact_id || contact.id}"
                    ${!contact.is_online ? 'disabled' : ''}
                    title="${contact.is_online ? 'Call' : 'Offline'}">
                    📞
                </button>

                <button
                    class="btn-remove-contact
                        bg-red-500 hover:bg-red-600
                        text-white text-sm
                        px-3 py-1 rounded-lg transition"
                    data-contact-id="${contact.contact_id || contact.id}"
                    title="Remove contact">
                    🗑️
                </button>
                </div>

            </div>
            `;

        
        // Click untuk chat
        el.addEventListener('click', (ev) => {
            if (ev.target.closest('.btn-call-contact') || 
                ev.target.closest('.btn-remove-contact')) return;
            
            // Panggil fungsi setContext dari chat-main.js
            if (window.setContext) {
                window.setContext({
                    type: "private",
                    userId: contact.contact_id || contact.id,
                    username: contact.username
                });
            }
        });
        
        // Call button
        const callBtn = el.querySelector('.btn-call-contact');
        if (callBtn) {
            callBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (!contact.is_online) return;
                
                if (window.startCall) {
                    window.startCall(contact.contact_id || contact.id);
                }
            });
        }
        
        // Remove button
        const removeBtn = el.querySelector('.btn-remove-contact');
        if (removeBtn) {
            removeBtn.addEventListener('click', async (ev) => {
                ev.stopPropagation();
                if (!confirm(`Remove ${contact.username} from contacts?`)) return;
                
                await removeContact(contact.contact_id || contact.id);
            });
        }
        
        contactsListEl.appendChild(el);
    });
}

// Search users
export async function searchUsers(query) {
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
        return data.users || [];
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

// Send contact request
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

// Accept contact request
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

// Reject contact request
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

// Remove contact
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

// Load pending requests
export async function loadPendingRequests() {
    try {
        const res = await fetch(`${API_ROOT}/contacts/pending`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!res.ok) throw new Error('Failed to load requests');
        
        const data = await res.json();
        renderPendingRequests(data.pending || []);
        
        // Update badge
        if (pendingBadgeEl) {
            const count = data.pending.length;
            pendingBadgeEl.textContent = count;
            pendingBadgeEl.style.display = count > 0 ? 'inline-block' : 'none';
        }
        
        return data.pending;
    } catch (error) {
        console.error('Error loading requests:', error);
        return [];
    }
}

// Render pending requests
function renderPendingRequests(requests) {
    if (!pendingRequestsEl) return;
    
    pendingRequestsEl.innerHTML = '';
    
    if (requests.length === 0) {
        pendingRequestsEl.innerHTML = `
            <div class="flex items-center justify-center
                        py-8 text-slate-400 text-sm">
                No pending requests
            </div>
            `;
        return;
    }
    
    requests.forEach(request => {
        const el = document.createElement("div");
        el.className = `
        flex items-center justify-between
        p-4 rounded-2xl
        bg-white/90 dark:bg-slate-800
        shadow-sm hover:shadow-lg
        transition-all duration-300
        `;

        el.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full
                        bg-gradient-to-br from-indigo-400 to-purple-500
                        flex items-center justify-center
                        text-white font-bold uppercase">
            ${request.username[0]}
            </div>

            <div class="flex flex-col">
            <span class="font-semibold text-slate-800 dark:text-white">
                ${request.username}
            </span>
            <span class="text-xs text-slate-400">
                ${formatTime(request.created_at)}
            </span>
            </div>
        </div>

        <div class="flex gap-2">
            <button
            class="btn-accept-request
                    bg-emerald-500 hover:bg-emerald-600
                    text-white text-xs
                    px-3 py-1.5 rounded-lg
                    transition active:scale-95"
            data-request-id="${request.id}">
            Accept
            </button>

            <button
            class="btn-reject-request
                    bg-rose-500 hover:bg-rose-600
                    text-white text-xs
                    px-3 py-1.5 rounded-lg
                    transition active:scale-95"
            data-request-id="${request.id}">
            Reject
            </button>
        </div>
        `;

        // Accept button
        const acceptBtn = el.querySelector('.btn-accept-request');
        if (acceptBtn) {
            acceptBtn.addEventListener('click', async () => {
                await acceptContactRequest(request.id);
            });
        }
        
        // Reject button
        const rejectBtn = el.querySelector('.btn-reject-request');
        if (rejectBtn) {
            rejectBtn.addEventListener('click', async () => {
                await rejectContactRequest(request.id);
            });
        }
        
        pendingRequestsEl.appendChild(el);
    });
}

// Show add contact modal
export function showAddContactModal() {
    if (addContactModal) {
        addContactModal.classList.remove('hidden');
        searchContactInput.focus();
    }
}

// Close modal
function closeAddContactModal() {
    if (addContactModal) {
        addContactModal.classList.add('hidden');
        searchResultsEl.innerHTML = '';
        searchContactInput.value = '';
    }
}

// Format time helper
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

// Setup event listeners
export function setupContactsUI() {
    // Add contact button - TIDAK PERLU (sudah ada di chat-ui.js)
    // if (btnAddContact) {
    //     btnAddContact.addEventListener('click', showAddContactModal);
    // }
    
    // Close modal button - TIDAK PERLU (sudah ada di chat-ui.js)
    // if (btnCloseModal) {
    //     btnCloseModal.addEventListener('click', closeAddContactModal);
    // }
    
    // Click outside modal to close - TIDAK PERLU (sudah ada di chat-ui.js)
    // if (addContactModal) {
    //     addContactModal.addEventListener('click', (e) => {
    //         if (e.target === addContactModal) {
    //             closeAddContactModal();
    //         }
    //     });
    // }
    
    // Search contact - PERBAIKAN: Gunakan fungsi dari chat-main.js
    if (btnSearchContact) {
        btnSearchContact.addEventListener('click', async () => {
            const query = searchContactInput.value.trim();
            if (query.length < 2) {
                alert('Please enter at least 2 characters');
                return;
            }
            
            if (window.searchUsers) {
                await window.searchUsers();
            } else {
                const users = await searchUsers(query);
                renderSearchResults(users);
            }
        });
    }
    
    // Search on Enter - PERBAIKAN: Gunakan fungsi dari chat-main.js
    if (searchContactInput) {
        searchContactInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const query = searchContactInput.value.trim();
                if (query.length >= 2) {
                    if (window.searchUsers) {
                        e.preventDefault();
                        await window.searchUsers();
                    } else {
                        const users = await searchUsers(query);
                        renderSearchResults(users);
                    }
                }
            }
        });
    }
}

// Render search results
function renderSearchResults(users) {
    if (!searchResultsEl) return;
    
    searchResultsEl.innerHTML = '';
    
    if (users.length === 0) {
        searchResultsEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                <div class="text-4xl mb-2">🔍</div>
                <p class="text-sm font-medium">No users found</p>
                <p class="text-xs text-slate-500 mt-1">Try searching with another name</p>
            </div>
            `;

        return;
    }
    
    users.forEach(user => {
        const el = document.createElement("div");
        el.className = `
        flex items-center justify-between
        p-3 mb-2
        rounded-xl
        bg-white/80 dark:bg-slate-800
        shadow hover:shadow-md
        transition
        `;

        el.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="flex flex-col">
            <div class="font-semibold text-slate-800 dark:text-white">
                ${user.username}
            </div>
            <div class="flex items-center gap-1 text-xs
                ${user.is_online ? 'text-green-500' : 'text-slate-400'}">
                <span class="w-2 h-2 rounded-full
                ${user.is_online ? 'bg-green-500' : 'bg-slate-400'}"></span>
                ${user.is_online ? 'Online' : 'Offline'}
            </div>
            </div>
        </div>

        <button
            class="btn-add-search
                bg-pink-500 hover:bg-pink-600
                text-white text-sm font-medium
                px-4 py-1.5
                rounded-lg
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
                    if (result.success) {
                        closeAddContactModal();
                    }
                } else {
                    const result = await sendContactRequest(user.username);
                    if (result && result.success) {
                        closeAddContactModal();
                    }
                }
            });
        }
        
        searchResultsEl.appendChild(el);
    });
}

// Handle WebSocket messages untuk kontak
export function handleContactWS(data) {
    switch (data.type) {
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
            break;
            
        case "contact_removed":
            console.log('🗑️ Contact removed:', data.contactId);
            // Reload contacts
            loadContacts();
            break;
    }
}

// Initialize contacts system
export async function initContacts() {
    // HAPUS: setupContactsListeners(); // Sudah ada di chat-ui.js
    // HAPUS: setupContactsUI(); // Sudah ada di chat-ui.js
    await loadContacts();
    await loadPendingRequests();
    
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
    
    // Expose functions ke window untuk chat-main.js
    window.loadContacts = loadContacts;
    window.renderContacts = renderContacts;
}

// Auto-update contact status
export function updateContactStatus(userId, isOnline) {
    // Update di contacts list
    const contactEl = document.querySelector(`.contactItem[data-contact-id="${userId}"]`);
    if (contactEl) {
        const statusDot = contactEl.querySelector('.status-dot');
        const statusText = contactEl.querySelector('.status-text');
        const callBtn = contactEl.querySelector('.btn-call-contact');
        
        if (statusDot) {
            statusDot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
        }
        
        if (statusText) {
            if (isOnline) {
                statusText.textContent = 'Online';
            } else {
                const now = new Date();
                statusText.textContent = `Last seen ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            }
        }
        
        if (callBtn) {
            callBtn.disabled = !isOnline;
            callBtn.title = isOnline ? 'Call' : 'Offline';
        }
    }
    
    // Juga update di global user status (untuk kompatibilitas)
    updateUserStatus(userId, isOnline);
}

// Setup event listeners untuk contacts system - TAMBAHKAN DI BAGIAN AKHIR
export function setupContactsListeners() {
  // Modal dan search events - TIDAK PERLU (sudah ada di chat-ui.js)
  // if (btnAddContact) {
  //   btnAddContact.addEventListener('click', showAddContactModal);
  // }
  
  // if (btnSearchContacts) {
  //   btnSearchContacts.addEventListener('click', showAddContactModal);
  // }
  
  // if (btnCloseModal) {
  //   btnCloseModal.addEventListener('click', closeAddContactModal);
  // }
  
  // if (addContactModal) {
  //   addContactModal.addEventListener('click', (e) => {
  //     if (e.target === addContactModal) {
  //       closeAddContactModal();
  //     }
  //   });
  // }
  
  // Search functionality - PERBAIKAN: Panggil fungsi dari window
  if (btnSearchContact) {
    btnSearchContact.addEventListener('click', async () => {
      const query = searchContactInput.value.trim();
      if (query.length < 2) {
        alert('Please enter at least 2 characters');
        return;
      }
      
      if (window.searchUsers) {
        await window.searchUsers();
      } else {
        const users = await searchUsers(query);
        renderSearchResults(users);
      }
    });
  }
  
  if (searchContactInput) {
    searchContactInput.addEventListener('keypress', async (e) => {
      if (e.key === "Enter") {
        const query = searchContactInput.value.trim();
        if (query.length >= 2) {
          if (window.searchUsers) {
            e.preventDefault();
            await window.searchUsers();
          } else {
            const users = await searchUsers(query);
            renderSearchResults(users);
          }
        }
      }
    });
  }
  
  // Keyboard shortcuts untuk kontak
  document.addEventListener("keydown", (e) => {
    // Ctrl+K untuk focus ke search contact
    if (e.ctrlKey && e.key === 'k' && searchContactInput) {
      e.preventDefault();
      showAddContactModal();
    }
    
    // Esc untuk close modal
    if (e.key === 'Escape' && addContactModal) {
      if (!addContactModal.classList.contains('hidden')) {
        closeAddContactModal();
      }
    }
  });
}