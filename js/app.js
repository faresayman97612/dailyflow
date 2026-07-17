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
const DAY_NAMES = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const STRIP_START_MIN = 0;        // 12:00 AM
const STRIP_END_MIN = 24 * 60;    // 12:00 AM next day
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
   POINTER DRAG (tray chips + placed item blocks)
   ========================================================= */
let dayTracks = []; // populated by renderWeekGrid(): [{ dayIdx, el }]

function findTrackAtPoint(clientX, clientY) {
  for (const { dayIdx, el } of dayTracks) {
    const rect = el.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return { dayIdx, el, rect };
    }
  }
  // fall back to nearest track horizontally if pointer is between/outside rows but over the grid
  if (clientX && dayTracks.length) {
    const first = dayTracks[0].el.getBoundingClientRect();
    if (clientX >= first.left && clientX <= first.right) {
      let closest = dayTracks[0];
      let closestDist = Infinity;
      for (const t of dayTracks) {
        const r = t.el.getBoundingClientRect();
        const mid = (r.top + r.bottom) / 2;
        const dist = Math.abs(clientY - mid);
        if (dist < closestDist) { closestDist = dist; closest = t; }
      }
      const rect = closest.el.getBoundingClientRect();
      return { dayIdx: closest.dayIdx, el: closest.el, rect };
    }
  }
  return null;
}

function clearTrackHighlights() {
  dayTracks.forEach(t => t.el.classList.remove("dragover"));
}

/**
 * Shared pointer-based drag for both tray chips and placed item blocks.
 * onPreview(dayIdx|null, startMinutes|null) fires live on every move.
 * onCommit(dayIdx|null, startMinutes|null) fires once on release.
 */
function startPointerDrag(handleEl, item, { onPreview, onCommit, onCancel }) {
  handleEl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-complete], [data-del-item]")) return;
    e.preventDefault();
    handleEl.setPointerCapture(e.pointerId);
    handleEl.classList.add("dragging");

    let lastResult = null; // { dayIdx, startMinutes } or null

    const onMove = (moveEvt) => {
      const hit = findTrackAtPoint(moveEvt.clientX, moveEvt.clientY);
      clearTrackHighlights();
      if (hit) {
        hit.el.classList.add("dragover");
        const offsetX = moveEvt.clientX - hit.rect.left;
        const startMinutes = pxToStartMinutes(offsetX, hit.rect.width, item.duration);
        lastResult = { dayIdx: hit.dayIdx, startMinutes };
      } else {
        lastResult = null;
      }
      onPreview(lastResult, moveEvt);
    };

    const onUp = () => {
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onCancelUp);
      handleEl.classList.remove("dragging");
      clearTrackHighlights();
      if (lastResult) {
        onCommit(lastResult);
      } else if (onCancel) {
        onCancel();
      }
    };

    const onCancelUp = () => {
      handleEl.removeEventListener("pointermove", onMove);
      handleEl.removeEventListener("pointerup", onUp);
      handleEl.removeEventListener("pointercancel", onCancelUp);
      handleEl.classList.remove("dragging");
      clearTrackHighlights();
      if (onCancel) onCancel();
    };

    handleEl.addEventListener("pointermove", onMove);
    handleEl.addEventListener("pointerup", onUp);
    handleEl.addEventListener("pointercancel", onCancelUp);
  });
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
    chip.dataset.itemId = item.id;
    chip.innerHTML = `
      <span>${item.title}</span>
      <span class="chip-duration">${item.duration}m</span>
      <button class="del" data-del-item="${item.id}" aria-label="Delete item">✕</button>
    `;
    tray.appendChild(chip);

    let ghost = null;
    startPointerDrag(chip, item, {
      onPreview: (result, evt) => {
        if (!ghost) {
          ghost = chip.cloneNode(true);
          ghost.classList.add("tray-chip-ghost");
          ghost.querySelector("[data-del-item]")?.remove();
          document.body.appendChild(ghost);
        }
        ghost.style.left = `${evt.clientX}px`;
        ghost.style.top = `${evt.clientY}px`;
        const timeSpan = ghost.querySelector(".chip-duration");
        if (result) {
          const end = result.startMinutes + item.duration;
          timeSpan.textContent = `${minutesToLabel(result.startMinutes)}–${minutesToLabel(end)}`;
        } else {
          timeSpan.textContent = `${item.duration}m`;
        }
      },
      onCommit: (result) => {
        ghost?.remove();
        ghost = null;
        updateDoc(doc(db, "scheduleItems", item.id), {
          day: result.dayIdx,
          startMinutes: result.startMinutes
        });
      },
      onCancel: () => {
        ghost?.remove();
        ghost = null;
      }
    });
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
  dayTracks = [];

  const todayIdx = (new Date().getDay() + 1) % 7; // Sat=0 ... Fri=6

  DAY_NAMES.forEach((dayName, dayIdx) => {
    const row = document.createElement("div");
    row.className = "week-row" + (dayIdx === todayIdx ? " today" : "");

    const label = document.createElement("div");
    label.className = "day-label";
    label.textContent = dayName;

    const track = document.createElement("div");
    track.className = "day-track";
    track.dataset.day = dayIdx;
    dayTracks.push({ dayIdx, el: track });

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
  block.dataset.itemId = item.id;

  const setPosition = (startMinutes, durationMin) => {
    const leftPct = ((startMinutes - STRIP_START_MIN) / STRIP_RANGE_MIN) * 100;
    const widthPct = (durationMin / STRIP_RANGE_MIN) * 100;
    block.style.left = `${leftPct}%`;
    block.style.width = `${widthPct}%`;
  };
  setPosition(item.startMinutes, item.duration);

  const timeEl = document.createElement("span");
  timeEl.className = "item-time";
  const setTimeLabel = (startMinutes) => {
    const endMinutes = startMinutes + item.duration;
    timeEl.textContent = `${minutesToLabel(startMinutes)}–${minutesToLabel(endMinutes)}`;
  };
  setTimeLabel(item.startMinutes);

  block.innerHTML = `
    <div class="item-controls">
      <input type="checkbox" ${item.completed ? "checked" : ""} data-complete="${item.id}" />
      <button class="del" data-del-item="${item.id}" aria-label="Delete item">✕</button>
    </div>
    <span class="item-title">${item.title}</span>
  `;
  block.appendChild(timeEl);

  block.querySelector("[data-complete]").onchange = (e) => {
    updateDoc(doc(db, "scheduleItems", item.id), { completed: e.target.checked });
  };
  block.querySelector("[data-del-item]").onclick = (e) => {
    e.stopPropagation();
    deleteDoc(doc(db, "scheduleItems", item.id));
  };

  const originalDay = item.day;
  const originalStart = item.startMinutes;

  startPointerDrag(block, item, {
    onPreview: (result) => {
      if (result) {
        const targetTrack = dayTracks.find(t => t.dayIdx === result.dayIdx)?.el;
        if (targetTrack && block.parentElement !== targetTrack) {
          targetTrack.appendChild(block);
        }
        setPosition(result.startMinutes, item.duration);
        setTimeLabel(result.startMinutes);
      }
    },
    onCommit: (result) => {
      if (result.dayIdx === originalDay && result.startMinutes === originalStart) return;
      updateDoc(doc(db, "scheduleItems", item.id), {
        day: result.dayIdx,
        startMinutes: result.startMinutes
      });
    },
    onCancel: () => {
      const originalTrack = dayTracks.find(t => t.dayIdx === originalDay)?.el;
      if (originalTrack && block.parentElement !== originalTrack) {
        originalTrack.appendChild(block);
      }
      setPosition(originalStart, item.duration);
      setTimeLabel(originalStart);
    }
  });

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
