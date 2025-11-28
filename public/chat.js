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

meNameEl.textContent = myUsername;
meInfoEl.textContent = `id: ${myId}`;

// State
let currentContext = { type: "global" };
let ws = null;
let reconnectTimer = null;

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

  if (m.sender_id !== myId) {
    const author = document.createElement("div");
    author.className = "author";
    author.textContent = m.username || "Unknown";
    bubble.appendChild(author);
  }

  const txt = document.createElement("div");
  txt.textContent = m.content;
  bubble.appendChild(txt);

  messagesEl.appendChild(bubble);
  scrollToBottom();
}

function shouldShowMessageForContext(m) {
  if (currentContext.type === "global") {
    return !m.room_id && !m.recipient_id;
  }
  if (currentContext.type === "room") {
    return Number(m.room_id) === Number(currentContext.roomId);
  }
  if (currentContext.type === "private") {
    const other = Number(currentContext.userId);
    return (
      (m.sender_id === myId && m.recipient_id === other) ||
      (m.sender_id === other && m.recipient_id === myId)
    );
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
    if (!m.room_id && !m.recipient_id) renderMessage(m);
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
  list.forEach((u) => {
    const el = document.createElement("div");
    el.className = "userItem";
    el.innerHTML = `
      <div>${u.username}</div>
      <div class="userStatus">${u.is_online ? "online" : "offline"}</div>
    `;
    el.onclick = () =>
      setContext({ type: "private", userId: u.id, username: u.username });
    usersListEl.appendChild(el);
  });
}

async function setContext(ctx) {
  currentContext = ctx;
  clearMessages();

  if (ctx.type === "global") {
    chatTitleEl.textContent = "Global";
    chatSubtitleEl.textContent = "Public global chat";

    const init = await fetch(API_ROOT + "/init", {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await init.json();
    (data.messages || [])
      .filter((m) => !m.room_id && !m.recipient_id)
      .forEach(renderMessage);

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
    (json.messages || []).forEach(renderMessage);
    return;
  }

  if (ctx.type === "private") {
    chatTitleEl.textContent = "Private — " + ctx.username;
    chatSubtitleEl.textContent = "Direct message";

    const res = await fetch(
      `${API_ROOT}/private/${encodeURIComponent(
        myUsername
      )}/${encodeURIComponent(ctx.username)}`,
      { headers: { Authorization: "Bearer " + token } }
    );
    const json = await res.json();
    (json || []).forEach(renderMessage);
  }
}

function connectWS() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${location.host}${WS_PATH}?token=${token}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    if (currentContext.type === "room") {
      ws.send(
        JSON.stringify({ type: "join_room", roomId: currentContext.roomId })
      );
    }
  };

  ws.onmessage = (ev) => {
    let data = {};
    try {
      data = JSON.parse(ev.data);
    } catch {}
    handleWS(data);
  };

  ws.onclose = () => {
    reconnectTimer = setTimeout(connectWS, 3000);
  };
}

function handleWS(data) {
  switch (data.type) {
    case "init":
      if (data.rooms) renderRooms(data.rooms);
      if (data.users) renderUsers(data.users);
      break;

    case "room_created":
      renderRooms([...Array.from(roomsListEl.children), data.room]);
      break;

    case "user_online":
    case "user_offline":
      loadInit();
      break;

    case "room_message":
    case "private_message":
      if (data.message && shouldShowMessageForContext(data.message))
        renderMessage(data.message);
      break;
  }
}

async function sendMessage() {
  const txt = msgInputEl.value.trim();
  if (!txt) return;

  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  if (currentContext.type === "global") {
    ws.send(
      JSON.stringify({ type: "room_message", roomId: null, content: txt })
    );
    renderMessage({ sender_id: myId, content: txt, username: myUsername });
  }

  if (currentContext.type === "room") {
    ws.send(
      JSON.stringify({
        type: "room_message",
        roomId: currentContext.roomId,
        content: txt,
      })
    );
    renderMessage({
      sender_id: myId,
      content: txt,
      username: myUsername,
      room_id: currentContext.roomId,
    });
  }

  if (currentContext.type === "private") {
    ws.send(
      JSON.stringify({
        type: "private_message",
        recipientId: currentContext.userId,
        content: txt,
      })
    );
    renderMessage({
      sender_id: myId,
      content: txt,
      username: myUsername,
      recipient_id: currentContext.userId,
    });
  }

  msgInputEl.value = "";
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

(async function init() {
  setContext({ type: "global" });
  await loadInit();
  connectWS();
})();
