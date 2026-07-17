import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

/* =========================================================
   AUTH
   ========================================================= */
let isSignUpMode = false;

const loginScreen = document.getElementById("loginScreen");
const appEl = document.getElementById("app");
const authError = document.getElementById("authError");

document.getElementById("switchLink").onclick = () => {
  isSignUpMode = !isSignUpMode;
  document.getElementById("submitAuthBtn").textContent = isSignUpMode ? "Create Account" : "Sign In";
  document.getElementById("loginSubtitle").textContent = isSignUpMode ? "Create your DailyFlow account" : "Sign in to plan your day";
  document.getElementById("switchText").textContent = isSignUpMode ? "Already have an account?" : "Don't have an account?";
  document.getElementById("switchLink").textContent = isSignUpMode ? "Sign in" : "Sign up";
  authError.textContent = "";
};

document.getElementById("submitAuthBtn").onclick = async () => {
  const email = document.getElementById("emailInput").value.trim();
  const password = document.getElementById("passwordInput").value;
  authError.textContent = "";
  try {
    if (isSignUpMode) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (e) {
    authError.textContent = friendlyAuthError(e.code);
  }
};

document.getElementById("googleBtn").onclick = async () => {
  authError.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    authError.textContent = friendlyAuthError(e.code);
  }
};

document.getElementById("logoutBtn").onclick = () => signOut(auth);

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email": "That email doesn't look right.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account already exists with that email.",
    "auth/weak-password": "Password should be at least 6 characters.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

let currentUser = null;
let unsubItems = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    loginScreen.style.display = "none";
    appEl.classList.add("active");
    startListeners();
  } else {
    loginScreen.style.display = "flex";
    appEl.classList.remove("active");
    if (unsubItems) unsubItems();
  }
});

/* =========================================================
   STATE + WEEK GRID CONFIG
   ========================================================= */
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STRIP_START_MIN = 6 * 60;   // 06:00
const STRIP_END_MIN = 23 * 60;    // 23:00
const STRIP_RANGE_MIN = STRIP_END_MIN - STRIP_START_MIN;
const SNAP_MIN = 15;

let scheduleItems = [];

/* =========================================================
   FIRESTORE LISTENERS
   ========================================================= */
function startListeners() {
  const itemsQ = query(collection(db, "scheduleItems"), where("uid", "==", currentUser.uid));
  unsubItems = onSnapshot(itemsQ, (snap) => {
    scheduleItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTray();
    renderWeekGrid();
  });
}

/* =========================================================
   TIME HELPERS
   ========================================================= */
function minutesToLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function clampStartMinutes(mins) {
  const snapped = Math.round(mins / SNAP_MIN) * SNAP_MIN;
  return Math.min(Math.max(snapped, STRIP_START_MIN), STRIP_END_MIN - SNAP_MIN);
}

function pxToStartMinutes(offsetX, trackWidth, durationMin) {
  const ratio = offsetX / trackWidth;
  const rawStart = STRIP_START_MIN + ratio * STRIP_RANGE_MIN;
  const maxStart = STRIP_END_MIN - durationMin;
  return clampStartMinutes(Math.min(rawStart, maxStart));
}

/* =========================================================
   RENDER: UNSCHEDULED TRAY
   ========================================================= */
function renderTray() {
  const tray = document.getElementById("tray");
  tray.innerHTML = "";

  const unplaced = scheduleItems.filter(item => item.day == null);

  if (unplaced.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No unscheduled items — add one below and drag it onto a day.";
    tray.appendChild(empty);
  }

  unplaced.forEach(item => {
    const chip = document.createElement("div");
    chip.className = "tray-chip";
    chip.draggable = true;
    chip.dataset.itemId = item.id;
    chip.innerHTML = `
      <span>${item.title}</span>
      <span class="chip-duration">${item.duration}m</span>
      <button class="del" data-del-item="${item.id}" aria-label="Delete item">✕</button>
    `;
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", item.id);
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
    tray.appendChild(chip);
  });

  tray.querySelectorAll("[data-del-item]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      deleteDoc(doc(db, "scheduleItems", btn.dataset.delItem));
    };
  });
}

/* =========================================================
   RENDER: WEEK GRID
   ========================================================= */
function renderWeekGrid() {
  const grid = document.getElementById("weekGrid");
  grid.innerHTML = "";

  const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0 ... Sun=6

  DAY_NAMES.forEach((dayName, dayIdx) => {
    const row = document.createElement("div");
    row.className = "week-row" + (dayIdx === todayIdx ? " today" : "");

    const label = document.createElement("div");
    label.className = "day-label";
    label.textContent = dayName;

    const track = document.createElement("div");
    track.className = "day-track";
    track.dataset.day = dayIdx;

    track.addEventListener("dragover", (e) => { e.preventDefault(); track.classList.add("dragover"); });
    track.addEventListener("dragleave", () => track.classList.remove("dragover"));
    track.addEventListener("drop", (e) => {
      e.preventDefault();
      track.classList.remove("dragover");
      const itemId = e.dataTransfer.getData("text/plain");
      const item = scheduleItems.find(i => i.id === itemId);
      if (!item) return;
      const rect = track.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const startMinutes = pxToStartMinutes(offsetX, rect.width, item.duration);
      updateDoc(doc(db, "scheduleItems", itemId), { day: dayIdx, startMinutes });
    });

    scheduleItems
      .filter(item => item.day === dayIdx)
      .forEach(item => track.appendChild(renderItemBlock(item)));

    row.appendChild(label);
    row.appendChild(track);
    grid.appendChild(row);
  });

  renderTickLabels();
}

function renderItemBlock(item) {
  const block = document.createElement("div");
  block.className = "item-block" + (item.completed ? " completed" : "");
  block.draggable = true;
  block.dataset.itemId = item.id;

  const leftPct = ((item.startMinutes - STRIP_START_MIN) / STRIP_RANGE_MIN) * 100;
  const widthPct = (item.duration / STRIP_RANGE_MIN) * 100;
  block.style.left = `${leftPct}%`;
  block.style.width = `${widthPct}%`;

  const endMinutes = item.startMinutes + item.duration;
  block.innerHTML = `
    <div class="item-controls">
      <input type="checkbox" ${item.completed ? "checked" : ""} data-complete="${item.id}" />
      <button class="del" data-del-item="${item.id}" aria-label="Delete item">✕</button>
    </div>
    <span class="item-title">${item.title}</span>
    <span class="item-time">${minutesToLabel(item.startMinutes)}–${minutesToLabel(endMinutes)}</span>
  `;

  block.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", item.id);
    block.classList.add("dragging");
  });
  block.addEventListener("dragend", () => block.classList.remove("dragging"));

  block.querySelector("[data-complete]").onchange = (e) => {
    updateDoc(doc(db, "scheduleItems", item.id), { completed: e.target.checked });
  };
  block.querySelector("[data-del-item]").onclick = (e) => {
    e.stopPropagation();
    deleteDoc(doc(db, "scheduleItems", item.id));
  };

  return block;
}

function renderTickLabels() {
  const grid = document.getElementById("weekGrid");
  let footer = document.querySelector(".week-grid-footer");
  if (footer) footer.remove();

  footer = document.createElement("div");
  footer.className = "week-grid-footer";
  const spacer = document.createElement("div");
  const ticks = document.createElement("div");
  ticks.className = "tick-labels";

  for (let mins = STRIP_START_MIN; mins <= STRIP_END_MIN; mins += 60) {
    const tick = document.createElement("span");
    tick.style.left = `${((mins - STRIP_START_MIN) / STRIP_RANGE_MIN) * 100}%`;
    tick.textContent = minutesToLabel(mins);
    ticks.appendChild(tick);
  }

  footer.appendChild(spacer);
  footer.appendChild(ticks);
  grid.after(footer);
}

/* =========================================================
   MODAL: NEW ITEM
   ========================================================= */
const itemModal = document.getElementById("itemModal");
document.getElementById("addItemBtn").onclick = () => itemModal.classList.add("active");
document.getElementById("itemCancel").onclick = () => itemModal.classList.remove("active");
document.getElementById("itemSave").onclick = async () => {
  const title = document.getElementById("itemTitle").value.trim();
  const duration = Number(document.getElementById("itemDuration").value) || 30;
  if (!title) return;
  await addDoc(collection(db, "scheduleItems"), {
    uid: currentUser.uid,
    title,
    duration,
    day: null,
    startMinutes: null,
    completed: false,
    createdAt: serverTimestamp()
  });
  document.getElementById("itemTitle").value = "";
  document.getElementById("itemDuration").value = 30;
  itemModal.classList.remove("active");
};

/* =========================================================
   DARK MODE
   ========================================================= */
const darkToggle = document.getElementById("darkToggle");
function applyDarkPref() {
  const saved = localStorage.getItem("dailyflow-dark");
  if (saved === "1") {
    document.body.classList.add("dark");
    darkToggle.textContent = "☀️";
  }
}
applyDarkPref();
darkToggle.onclick = () => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  darkToggle.textContent = isDark ? "☀️" : "🌙";
  localStorage.setItem("dailyflow-dark", isDark ? "1" : "0");
};
