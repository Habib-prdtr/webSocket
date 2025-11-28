const API = "http://localhost:3000/api";

function saveAuth(token, id, username) {
  sessionStorage.setItem("token", token);
  sessionStorage.setItem("id", id);
  sessionStorage.setItem("username", username);
}

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  const res = await fetch(API + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (data.error) return alert(data.error);

  saveAuth(data.token, data.id, data.username);
  window.location = "chat.html";
}

async function registerUser() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  const res = await fetch(API + "/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (data.error) return alert(data.error);

  saveAuth(data.token, data.id, data.username);
  window.location = "chat.html";
}

function logout() {
  sessionStorage.clear();
  window.location = "login.html";
}

if (!sessionStorage.getItem("token") && !location.href.includes("login") && !location.href.includes("register")) {
  window.location = "login.html";
}
