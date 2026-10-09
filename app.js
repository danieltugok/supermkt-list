import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, onValue, push, update, remove
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const itemsRef = ref(db, "items");

const $ = (s) => document.querySelector(s);
const els = {
  boot: $("#boot"), login: $("#login"), denied: $("#denied"), app: $("#app"),
  list: $("#list"), count: $("#count"), cats: $("#cats"),
  addForm: $("#add"), cat: $("#cat"), name: $("#name"),
  hide: $("#hide"), editBtn: $("#editmode"), banner: $("#edit-banner"), hint: $("#hint"), trip: $("#trip"), who: $("#who"), dot: $("#dot"),
  edit: $("#edit"), editForm: $("#edit-form"), editName: $("#edit-name"), editCat: $("#edit-cat"),
  toast: $("#toast")
};

/* ---------- tiny safe storage ---------- */
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} }
};

const CACHE_KEY = "supermkt:items";
const HIDE_KEY = "supermkt:hideBought";

let currentUser = null;
let items = {};
let unsubscribe = null;
let unsubscribeConn = null;
let hideBought = store.get(HIDE_KEY) === "1";
let editingId = null;
let editMode = false;

function loadCache() {
  try { return JSON.parse(store.get(CACHE_KEY)) || {}; } catch { return {}; }
}

/* ---------- views ---------- */
function show(view) {
  els.boot.hidden = true;
  els.login.hidden = view !== "login";
  els.denied.hidden = view !== "denied";
  els.app.hidden = view !== "app";
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

/* ---------- auth ---------- */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) {
    stopListening();
    items = {};
    store.del(CACHE_KEY);
    show("login");
    return;
  }
  els.who.textContent = user.email || "";
  items = loadCache();
  show("app");
  render();
  startListening();
});

$("#signin").addEventListener("click", async () => {
  const err = $("#login-error");
  err.textContent = "";
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      try { await signInWithRedirect(auth, provider); } catch (e2) { err.textContent = e2.message; }
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      err.textContent = e.message;
    }
  }
});

$("#signout").addEventListener("click", () => signOut(auth));
$("#denied-out").addEventListener("click", () => signOut(auth));

/* ---------- realtime listeners ---------- */
function startListening() {
  stopListening();
  unsubscribe = onValue(
    itemsRef,
    (snap) => {
      items = snap.val() || {};
      store.set(CACHE_KEY, JSON.stringify(items));
      render();
    },
    (error) => {
      if (/permission_denied/i.test(error.code + " " + error.message)) {
        $("#denied-email").textContent = currentUser?.email || "This account";
        show("denied");
      } else {
        toast("Sync problem: " + error.message);
      }
    }
  );
  unsubscribeConn = onValue(ref(db, ".info/connected"), (s) => {
    els.dot.classList.toggle("online", !!s.val());
  });
}

function stopListening() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (unsubscribeConn) { unsubscribeConn(); unsubscribeConn = null; }
}

/* ---------- helpers ---------- */
const who = () => (currentUser?.displayName || currentUser?.email || "").split(/[ @]/)[0].slice(0, 60);
const norm = (s) => String(s || "").trim().replace(/\s+/g, " ");
const stamp = () => ({ updatedBy: who(), updatedAt: Date.now() });

function allCategories() {
  const seen = new Map();
  for (const v of Object.values(items)) {
    const c = norm(v.category);
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  return seen;
}

// Reuse the casing of an existing category ("bakery" -> "Bakery").
function canonCategory(input) {
  const c = norm(input);
  return allCategories().get(c.toLowerCase()) || c;
}

function nextOrder(category) {
  const orders = Object.values(items)
    .filter((v) => norm(v.category).toLowerCase() === category.toLowerCase() && Number.isFinite(v.order))
    .map((v) => v.order);
  return orders.length ? Math.max(...orders) + 1 : undefined;
}

/* ---------- render ---------- */
function render() {
  if (drag.active) { drag.pending = true; return; }
  const entries = Object.entries(items).map(([id, v]) => ({
    id, name: norm(v.name), category: norm(v.category), bought: !!v.bought,
    order: Number.isFinite(v.order) ? v.order : undefined
  })).filter((e) => e.name);

  const done = entries.filter((e) => e.bought).length;
  els.count.textContent = entries.length ? `${done} of ${entries.length} bought` : "";
  const hideTip = hideBought ? "Show bought items" : "Hide bought items";
  els.hide.setAttribute("aria-pressed", String(hideBought));
  els.hide.setAttribute("aria-label", hideTip);
  els.hide.dataset.tip = hideTip;

  const groups = new Map();
  for (const e of entries) {
    if (hideBought && !editMode && e.bought) continue;
    const key = e.category.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label: e.category, list: [] });
    groups.get(key).list.push(e);
  }

  const keys = [...groups.keys()].sort((a, b) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, undefined, { sensitivity: "base" }));

  els.list.replaceChildren();
  if (!keys.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = entries.length ? "Everything is bought 🎉" : "Your list is empty. Add your first item above.";
    els.list.append(p);
  }
  for (const key of keys) {
    const g = groups.get(key);
    const head = document.createElement("div");
    head.className = "group";
    head.textContent = g.label || "No category";
    const box = document.createElement("div");
    box.className = "chips";
    g.list.sort((a, b) =>
      ((a.order ?? Infinity) - (b.order ?? Infinity)) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    box.dataset.cat = g.label;
    for (const e of g.list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (e.bought ? " bought" : "");
      b.dataset.id = e.id;
      b.setAttribute("aria-pressed", String(e.bought));
      b.textContent = e.name;
      box.append(b);
    }
    els.list.append(head, box);
  }

  els.banner.hidden = !editMode;
  els.hint.textContent = editMode ? "" : "Tap an item to check it off. Use the pencil to edit or reorder.";
  document.body.classList.toggle("editing", editMode);

  els.cats.replaceChildren(...[...allCategories().values()].sort().map((c) => {
    const o = document.createElement("option");
    o.value = c;
    return o;
  }));
}

/* ---------- interactions ---------- */
/* ---------- drag and drop (edit mode) ---------- */
const drag = {
  active: false, pending: false, el: null, ghost: null, candidate: null,
  timer: null, scroll: null, offX: 0, offY: 0, startX: 0, startY: 0, x: 0, y: 0, justDragged: false
};

els.editBtn.addEventListener("click", () => {
  editMode = !editMode;
  els.editBtn.setAttribute("aria-pressed", String(editMode));
  const tip = editMode ? "Done editing" : "Edit and reorder items";
  els.editBtn.dataset.tip = tip;
  els.editBtn.setAttribute("aria-label", tip);
  render();
});

els.list.addEventListener("pointerdown", (ev) => {
  if (!editMode) return;
  const b = ev.target.closest(".chip");
  if (!b) return;
  drag.candidate = b;
  drag.startX = ev.clientX; drag.startY = ev.clientY;
  clearTimeout(drag.timer);
  drag.timer = setTimeout(() => beginDrag(b, drag.startX, drag.startY), 250);
  document.addEventListener("pointermove", onCandidateMove);
  document.addEventListener("pointerup", cancelCandidate);
  document.addEventListener("pointercancel", cancelCandidate);
});

function cancelCandidate() {
  clearTimeout(drag.timer);
  drag.candidate = null;
  document.removeEventListener("pointermove", onCandidateMove);
  document.removeEventListener("pointerup", cancelCandidate);
  document.removeEventListener("pointercancel", cancelCandidate);
}

function onCandidateMove(ev) {
  if (!drag.candidate || drag.active) return;
  if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) <= 10) return;
  // Mouse: start dragging right away. Touch: the user is scrolling, so cancel.
  if (ev.pointerType === "mouse") beginDrag(drag.candidate, ev.clientX, ev.clientY);
  else cancelCandidate();
}

function beginDrag(chip, x, y) {
  cancelCandidate();
  if (!chip.isConnected) return;
  drag.active = true;
  drag.el = chip;
  const r = chip.getBoundingClientRect();
  drag.offX = x - r.left; drag.offY = y - r.top;
  drag.x = x; drag.y = y;
  drag.ghost = chip.cloneNode(true);
  drag.ghost.classList.add("ghost");
  drag.ghost.style.width = r.width + "px";
  drag.ghost.style.height = r.height + "px";
  document.body.append(drag.ghost);
  chip.classList.add("dragging");
  positionGhost();
  navigator.vibrate?.(15);
  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd);
  document.addEventListener("pointercancel", onDragEnd);
  drag.scroll = setInterval(() => {
    if (drag.y < 90) { window.scrollBy(0, -10); place(drag.x, drag.y); }
    else if (drag.y > window.innerHeight - 90) { window.scrollBy(0, 10); place(drag.x, drag.y); }
  }, 16);
}

// Stop the page scrolling while a drag is in progress (touch).
document.addEventListener("touchmove", (e) => { if (drag.active) e.preventDefault(); }, { passive: false });

function positionGhost() {
  drag.ghost.style.left = (drag.x - drag.offX) + "px";
  drag.ghost.style.top = (drag.y - drag.offY) + "px";
}

function onDragMove(ev) {
  drag.x = ev.clientX; drag.y = ev.clientY;
  positionGhost();
  place(drag.x, drag.y);
}

// Move the real chip to where the pointer is, as a live preview.
function place(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return;
  const over = el.closest(".chip");
  if (over && over !== drag.el) {
    const r = over.getBoundingClientRect();
    const wide = r.width > over.parentNode.getBoundingClientRect().width * 0.6;
    const after = wide ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
    over.parentNode.insertBefore(drag.el, after ? over.nextSibling : over);
    return;
  }
  if (over) return;
  const box = el.closest(".chips");
  if (box) { box.append(drag.el); return; }
  const head = el.closest(".group");
  const next = head?.nextElementSibling;
  if (next?.classList.contains("chips")) next.prepend(drag.el);
}

function onDragEnd(ev) {
  document.removeEventListener("pointermove", onDragMove);
  document.removeEventListener("pointerup", onDragEnd);
  document.removeEventListener("pointercancel", onDragEnd);
  clearInterval(drag.scroll);
  const chip = drag.el;
  const box = chip.parentNode;
  drag.ghost.remove();
  chip.classList.remove("dragging");
  drag.active = false;
  drag.justDragged = true;
  setTimeout(() => { drag.justDragged = false; }, 60);

  if (ev.type !== "pointercancel" && box?.classList?.contains("chips")) {
    const label = box.dataset.cat || "";
    const patch = {};
    [...box.querySelectorAll(".chip")].forEach((c, i) => {
      const it = items[c.dataset.id];
      if (it && it.order !== i) patch[`${c.dataset.id}/order`] = i;
    });
    const id = chip.dataset.id;
    const it = items[id];
    if (it && norm(it.category).toLowerCase() !== label.toLowerCase()) patch[`${id}/category`] = label;
    if (Object.keys(patch).length) {
      patch[`${id}/updatedBy`] = who();
      patch[`${id}/updatedAt`] = Date.now();
      update(itemsRef, patch).catch((e) => toast(e.message));
    }
  }
  drag.el = null; drag.ghost = null; drag.pending = false;
  render();
}

/* ---------- taps ---------- */
function toggle(id) {
  const it = items[id];
  if (!it) return;
  update(ref(db, `items/${id}`), { bought: !it.bought, ...stamp() }).catch((e) => toast(e.message));
}

els.list.addEventListener("click", (ev) => {
  const b = ev.target.closest(".chip");
  if (!b || drag.justDragged) return;
  if (editMode) openEdit(b.dataset.id);
  else toggle(b.dataset.id);
});
els.list.addEventListener("contextmenu", (ev) => {
  if (ev.target.closest(".chip")) ev.preventDefault();
});

els.addForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const name = norm(els.name.value);
  if (!name) return;
  const category = canonCategory(els.cat.value);

  const dup = Object.entries(items).find(([, v]) => norm(v.name).toLowerCase() === name.toLowerCase());
  if (dup) {
    const [id, v] = dup;
    const patch = { bought: false, ...stamp() };
    if (category) patch.category = category;
    update(ref(db, `items/${id}`), patch).catch((e) => toast(e.message));
    toast(`"${norm(v.name)}" is already listed. Marked as needed.`);
  } else {
    const order = nextOrder(category);
    push(itemsRef, {
      name, category, bought: false, ...stamp(), ...(order !== undefined ? { order } : {})
    }).catch((e) => toast(e.message));
  }
  els.name.value = "";
  els.name.focus();
});

els.hide.addEventListener("click", () => {
  hideBought = !hideBought;
  store.set(HIDE_KEY, hideBought ? "1" : "0");
  render();
  toast(hideBought ? "Hiding bought items" : "Showing bought items");
});

els.trip.addEventListener("click", () => {
  const ids = Object.entries(items).filter(([, v]) => v.bought).map(([id]) => id);
  if (!ids.length) { toast("Nothing is checked yet."); return; }
  if (!confirm(`Start a new trip? This unchecks ${ids.length} item(s) for both of you.`)) return;
  const patch = {};
  for (const id of ids) patch[`${id}/bought`] = false;
  update(itemsRef, patch).catch((e) => toast(e.message));
});

/* ---------- edit dialog ---------- */
function openEdit(id) {
  const it = items[id];
  if (!it) return;
  editingId = id;
  els.editName.value = norm(it.name);
  els.editCat.value = norm(it.category);
  els.edit.showModal();
}

els.editForm.addEventListener("submit", () => {
  const name = norm(els.editName.value);
  if (!editingId || !name) return;
  const category = canonCategory(els.editCat.value);
  const patch = { name, category, ...stamp() };
  if (norm(items[editingId]?.category).toLowerCase() !== category.toLowerCase()) {
    patch.order = nextOrder(category) ?? null;
  }
  update(ref(db, `items/${editingId}`), patch).catch((e) => toast(e.message));
  editingId = null;
});
$("#edit-cancel").addEventListener("click", () => { editingId = null; els.edit.close(); });
$("#edit-delete").addEventListener("click", () => {
  if (editingId) remove(ref(db, `items/${editingId}`)).catch((e) => toast(e.message));
  editingId = null;
  els.edit.close();
});

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
