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
let unsubFavs = null, unsubItems = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    loginScreen.style.display = "none";
    appEl.classList.add("active");
    startListeners();
  } else {
    loginScreen.style.display = "flex";
    appEl.classList.remove("active");
    if (unsubFavs) unsubFavs();
    if (unsubItems) unsubItems();
  }
});

/* =========================================================
   STATE + DATE
   ========================================================= */
const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
document.getElementById("todayLabel").textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long", month: "long", day: "numeric"
});

let favorites = [];
let scheduleItems = [];

const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 05:00 - 22:00

/* =========================================================
   FIRESTORE LISTENERS
   ========================================================= */
function startListeners() {
  const favQ = query(collection(db, "favorites"), where("uid", "==", currentUser.uid));
  unsubFavs = onSnapshot(favQ, (snap) => {
    favorites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFavorites();
  });

  const itemsQ = query(
    collection(db, "scheduleItems"),
    where("uid", "==", currentUser.uid),
    where("date", "==", todayStr)
  );
  unsubItems = onSnapshot(itemsQ, (snap) => {
    scheduleItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTimeline();
  });
}

/* =========================================================
   RENDER: FAVORITES
   ========================================================= */
function renderFavorites() {
  const list = document.getElementById("favList");
  list.innerHTML = "";

  if (favorites.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No favorites yet — add one below.";
    list.appendChild(empty);
  }

  favorites.forEach(fav => {
    const el = document.createElement("div");
    el.className = "fav-item";
    el.draggable = true;
    el.dataset.favId = fav.id;
    el.innerHTML = `
      <span class="fav-dot" style="background:${fav.color}"></span>
      <span>${fav.icon || "•"} ${fav.title}</span>
      <button class="del" data-del-fav="${fav.id}" aria-label="Delete favorite">✕</button>
    `;
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", fav.id);
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
    list.appendChild(el);
  });
  list.querySelectorAll("[data-del-fav]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      deleteDoc(doc(db, "favorites", btn.dataset.delFav));
    };
  });
}

/* =========================================================
   RENDER: TIMELINE
   ========================================================= */
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function renderTimeline() {
  const timeline = document.getElementById("timeline");
  timeline.innerHTML = "";

  const nowHour = new Date().getHours();

  HOURS.forEach(hour => {
    const row = document.createElement("div");
    row.className = "hour-row" + (hour === nowHour ? " current-hour" : "");

    const label = document.createElement("div");
    label.className = "hour-label";
    label.textContent = `${String(hour).padStart(2, "0")}:00`;

    const slot = document.createElement("div");
    slot.className = "hour-slot";
    slot.dataset.hour = hour;

    slot.addEventListener("dragover", (e) => { e.preventDefault(); slot.classList.add("dragover"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("dragover"));
    slot.addEventListener("drop", (e) => {
      e.preventDefault();
      slot.classList.remove("dragover");
      const favId = e.dataTransfer.getData("text/plain");
      const fav = favorites.find(f => f.id === favId);
      if (!fav) return;
      const start = `${String(hour).padStart(2, "0")}:00`;
      const durationMin = fav.defaultDuration || 30;
      const endMinutes = hour * 60 + durationMin;
      const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
      addDoc(collection(db, "scheduleItems"), {
        uid: currentUser.uid,
        date: todayStr,
        title: fav.title,
        icon: fav.icon,
        color: fav.color,
        favoriteId: fav.id,
        startTime: start,
        endTime: end,
        completed: false,
        notes: "",
        createdAt: serverTimestamp()
      });
    });

    // items that start in this hour
    const itemsInHour = scheduleItems
      .filter(item => Math.floor(timeToMinutes(item.startTime) / 60) === hour)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    itemsInHour.forEach(item => {
      const act = document.createElement("div");
      act.className = "activity" + (item.completed ? " completed" : "");
      act.style.borderLeftColor = item.color || "var(--gold)";
      act.innerHTML = `
        <input type="checkbox" ${item.completed ? "checked" : ""} data-complete="${item.id}" />
        <span class="time">${item.startTime}–${item.endTime}</span>
        <span class="title">${item.icon || ""} ${item.title}</span>
        <button data-del-item="${item.id}" aria-label="Delete activity">✕</button>
      `;
      slot.appendChild(act);
    });

    row.appendChild(label);
    row.appendChild(slot);
    timeline.appendChild(row);
  });

  timeline.querySelectorAll("[data-complete]").forEach(cb => {
    cb.onchange = () => {
      updateDoc(doc(db, "scheduleItems", cb.dataset.complete), { completed: cb.checked });
    };
  });
  timeline.querySelectorAll("[data-del-item]").forEach(btn => {
    btn.onclick = () => deleteDoc(doc(db, "scheduleItems", btn.dataset.delItem));
  });
}

/* =========================================================
   MODALS: ADD FAVORITE
   ========================================================= */
const favModal = document.getElementById("favModal");
document.getElementById("addFavBtn").onclick = () => favModal.classList.add("active");
document.getElementById("favCancel").onclick = () => favModal.classList.remove("active");
document.getElementById("favSave").onclick = async () => {
  const title = document.getElementById("favTitle").value.trim();
  if (!title) return;
  await addDoc(collection(db, "favorites"), {
    uid: currentUser.uid,
    title,
    icon: document.getElementById("favIcon").value.trim(),
    color: document.getElementById("favColor").value,
    defaultDuration: Number(document.getElementById("favDuration").value) || 30,
    createdAt: serverTimestamp()
  });
  document.getElementById("favTitle").value = "";
  document.getElementById("favIcon").value = "";
  document.getElementById("favDuration").value = 30;
  favModal.classList.remove("active");
};

/* =========================================================
   MODALS: QUICK ADD SCHEDULE ITEM
   ========================================================= */
const itemModal = document.getElementById("itemModal");
document.getElementById("quickAddBtn").onclick = () => itemModal.classList.add("active");
document.getElementById("itemCancel").onclick = () => itemModal.classList.remove("active");
document.getElementById("itemSave").onclick = async () => {
  const title = document.getElementById("itemTitle").value.trim();
  const startTime = document.getElementById("itemStart").value;
  const endTime = document.getElementById("itemEnd").value;
  if (!title || !startTime || !endTime) return;
  await addDoc(collection(db, "scheduleItems"), {
    uid: currentUser.uid,
    date: todayStr,
    title,
    icon: "",
    color: "#465E95",
    startTime,
    endTime,
    completed: false,
    notes: document.getElementById("itemNotes").value.trim(),
    createdAt: serverTimestamp()
  });
  document.getElementById("itemTitle").value = "";
  document.getElementById("itemNotes").value = "";
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
