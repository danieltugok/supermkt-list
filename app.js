import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, onValue, push, update, remove, set
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig, ownerEmails } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const itemsRef = ref(db, "items");

const $ = (s) => document.querySelector(s);
const els = {
  boot: $("#boot"), login: $("#login"), denied: $("#denied"), app: $("#app"),
  list: $("#list"), count: $("#count"),
  addForm: $("#add"), cat: $("#cat"), name: $("#name"),
  shareBtn: $("#share-btn"), share: $("#share"), shareForm: $("#share-form"), shareEmail: $("#share-email"),
  shareMsg: $("#share-msg"), memberList: $("#member-list"),
  hide: $("#hide"), editBtn: $("#editmode"), banner: $("#edit-banner"), hint: $("#hint"), trip: $("#trip"), who: $("#who"), dot: $("#dot"),
  edit: $("#edit"), editForm: $("#edit-form"), editName: $("#edit-name"), editCat: $("#edit-cat"),
  toast: $("#toast"),
  update: $("#update"), updateText: $("#update-text"), updateBtn: $("#update-btn"), updateLater: $("#update-later"),
  version: $("#version"),
  filterBtn: $("#filter-btn"), filterBadge: $("#filter-badge"), filter: $("#filter"), filterList: $("#filter-list")
};

/* ---------- tiny safe storage ---------- */
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} }
};

const CACHE_KEY = "supermkt:items";
const HIDE_KEY = "supermkt:hideBought";
const HIDDEN_CATS_KEY = "supermkt:hiddenCats";

let currentUser = null;
let items = {};
let unsubscribe = null;
let unsubscribeConn = null;
let hideBought = store.get(HIDE_KEY) === "1";
// Categories the user chose NOT to see on this device (lowercase keys; "" = No category).
let hiddenCats = new Set((() => {
  try { const a = JSON.parse(store.get(HIDDEN_CATS_KEY)); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; }
  catch { return []; }
})());
const saveHidden = () => store.set(HIDDEN_CATS_KEY, JSON.stringify([...hiddenCats]));
let editingId = null;
let editMode = false;
let armedId = null;
let members = {};
let isOwner = false;
let unsubscribeMembers = null;
let armedCat = null;      // lowercase category key waiting for a second tap
let catTimer = null;

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

function toast(msg, action) {
  const text = document.createElement("span");
  text.textContent = msg;
  els.toast.replaceChildren(text);
  els.toast.classList.toggle("has-action", !!action);
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => { els.toast.classList.remove("show"); action.fn(); });
    els.toast.append(btn);
  }
  els.toast.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => els.toast.classList.remove("show"), action ? 7000 : 2600);
}

/* ---------- auth ---------- */
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) {
    stopListening();
    items = {};
    members = {};
    isOwner = false;
    els.shareBtn.hidden = true;
    store.del(CACHE_KEY);
    show("login");
    return;
  }
  els.who.textContent = user.email || "";
  isOwner = ownerEmails.some((e) => e.toLowerCase() === (user.email || "").toLowerCase());
  els.shareBtn.hidden = !isOwner;
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
  if (isOwner) {
    unsubscribeMembers = onValue(ref(db, "access/members"), (s) => {
      members = s.val() || {};
      renderMembers();
    }, () => {});
  }
}

function stopListening() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (unsubscribeConn) { unsubscribeConn(); unsubscribeConn = null; }
  if (unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
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

  // Category filter (paused in edit mode so dragging between categories always works).
  const existing = new Set(entries.map((e) => e.category.toLowerCase()));
  const hiddenNow = [...hiddenCats].filter((k) => existing.has(k)).length;
  const shown = editMode ? entries : entries.filter((e) => !hiddenCats.has(e.category.toLowerCase()));
  els.filterBadge.hidden = hiddenNow === 0;
  els.filterBadge.textContent = String(hiddenNow);
  els.filterBtn.setAttribute("aria-pressed", String(hiddenNow > 0));

  const done = shown.filter((e) => e.bought).length;
  els.count.textContent = shown.length ? `${done} of ${shown.length} bought` : "";
  const hideTip = hideBought ? "Show bought items" : "Hide bought items";
  els.hide.setAttribute("aria-pressed", String(hideBought));
  els.hide.setAttribute("aria-label", hideTip);
  els.hide.dataset.tip = hideTip;

  const groups = new Map();
  for (const e of shown) {
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
    if (entries.length && !shown.length) {
      p.append("Every category is hidden by your filter. ");
      const b = document.createElement("button");
      b.type = "button"; b.className = "link"; b.dataset.act = "show-all"; b.textContent = "Show all";
      p.append(b);
    } else {
      p.textContent = entries.length ? "Everything is bought 🎉" : "Your list is empty. Add your first item above.";
    }
    els.list.append(p);
  }
  for (const key of keys) {
    const g = groups.get(key);
    const head = document.createElement("div");
    head.className = "group";
    const title = document.createElement("span");
    title.textContent = g.label || "No category";
    head.append(title);
    if (g.label) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "group-x";
      x.dataset.cat = g.label;
      if (armedCat === key) {
        x.classList.add("armed");
        x.textContent = "Delete?";
        x.setAttribute("aria-label", `Confirm: delete category ${g.label}`);
      } else {
        x.innerHTML = "&#10005;";
        x.setAttribute("aria-label", `Delete category ${g.label}`);
      }
      head.append(x);
    }
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
      if (e.id === armedId) b.classList.add("armed");
      b.setAttribute("aria-pressed", String(e.bought));
      b.textContent = e.name;
      box.append(b);
    }
    els.list.append(head, box);
  }

  els.banner.hidden = !editMode;
  els.hint.textContent = editMode ? "" : "Tap an item to check it off. Hold it for 2 seconds to delete. Use the pencil to edit or reorder.";
  document.body.classList.toggle("editing", editMode);

  if (els.filter.open) renderFilter();
}

/* ---------- interactions ---------- */
/* ---------- drag and drop (edit mode) ---------- */
const drag = {
  active: false, pending: false, el: null, ghost: null, candidate: null,
  timer: null, scroll: null, offX: 0, offY: 0, startX: 0, startY: 0, x: 0, y: 0, justDragged: false
};

els.editBtn.addEventListener("click", () => {
  armedId = null;
  armedCat = null;
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

/* ---------- delete a category (its items move to "No category") ---------- */
function deleteCategory(label) {
  const key = label.toLowerCase();
  const moved = Object.entries(items)
    .filter(([, v]) => norm(v.category).toLowerCase() === key)
    .sort(([, a], [, b]) =>
      ((a.order ?? Infinity) - (b.order ?? Infinity)) ||
      norm(a.name).localeCompare(norm(b.name), undefined, { sensitivity: "base" }));
  if (!moved.length) return;

  let next = nextOrder("");               // keep moved items after existing uncategorized ones
  const patch = {}, undo = {};
  for (const [id, v] of moved) {
    patch[`${id}/category`] = "";
    patch[`${id}/order`] = next !== undefined ? next++ : null;
    patch[`${id}/updatedBy`] = who();
    patch[`${id}/updatedAt`] = Date.now();
    undo[`${id}/category`] = v.category;
    undo[`${id}/order`] = Number.isFinite(v.order) ? v.order : null;
  }
  update(itemsRef, patch).catch((e) => toast(e.message));
  const n = moved.length;
  toast(`Deleted "${label}". ${n} item${n === 1 ? "" : "s"} moved to No category.`, {
    label: "Undo",
    fn: () => update(itemsRef, undo).catch((e) => toast(e.message))
  });
}

function disarmCat() {
  if (armedCat === null) return;
  armedCat = null;
  clearTimeout(catTimer);
  render();
}

els.list.addEventListener("click", (ev) => {
  const x = ev.target.closest(".group-x");
  if (!x) return;
  const key = x.dataset.cat.toLowerCase();
  if (armedCat === key) {                      // second tap: confirmed
    armedCat = null;
    clearTimeout(catTimer);
    deleteCategory(x.dataset.cat);
  } else {                                     // first tap: ask "Delete?"
    armedId = null;
    armedCat = key;
    clearTimeout(catTimer);
    catTimer = setTimeout(disarmCat, 4000);
    render();
  }
});

/* ---------- hold 2s to delete (normal mode) ---------- */
const HOLD_MS = 2000;
const X_ZONE = 62;          // px at the right edge of an armed chip that count as the X
const press = { timer: null, show: null, chip: null, armedThisPress: false, x: 0, y: 0 };
let suppressClickUntil = 0;
let disarmTimer = null;

function removeItem(id) {
  const name = norm(items[id]?.name);
  remove(ref(db, `items/${id}`)).catch((e) => toast(e.message));
  toast(`Deleted "${name}"`);
}

function arm(id) {
  armedCat = null;
  armedId = id;
  clearTimeout(disarmTimer);
  disarmTimer = setTimeout(disarm, 6000);
  render();
}

function disarm() {
  if (armedId === null) return;
  armedId = null;
  clearTimeout(disarmTimer);
  render();
}

function endPress() {
  clearTimeout(press.timer);
  clearTimeout(press.show);
  press.chip?.classList.remove("pressing");
  if (press.armedThisPress) suppressClickUntil = Date.now() + 400;
  press.chip = null;
  press.armedThisPress = false;
}

els.list.addEventListener("pointerdown", (ev) => {
  if (editMode) return;
  const b = ev.target.closest(".chip");
  if (!b) return;
  const id = b.dataset.id;
  if (armedId !== null && armedId === id) return;   // handled by the click (X or cancel)
  endPress();
  press.chip = b;
  press.x = ev.clientX; press.y = ev.clientY;
  press.show = setTimeout(() => b.classList.add("pressing"), 400);
  press.timer = setTimeout(() => {
    press.armedThisPress = true;
    navigator.vibrate?.(30);
    arm(id);
  }, HOLD_MS);
});
els.list.addEventListener("pointermove", (ev) => {
  if (press.chip && !press.armedThisPress && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 10) endPress();
});
for (const t of ["pointerup", "pointercancel", "pointerleave"]) {
  els.list.addEventListener(t, () => { if (press.chip || press.armedThisPress) endPress(); });
}
// Tapping anywhere outside the armed chip cancels the delete.
document.addEventListener("pointerdown", (ev) => {
  if (armedCat !== null && !ev.target.closest(".group-x")) disarmCat();
  if (armedId === null) return;
  if (!ev.target.closest(`.chip[data-id="${armedId}"]`)) disarm();
});

els.list.addEventListener("click", (ev) => {
  if (Date.now() < suppressClickUntil || drag.justDragged) return;
  const b = ev.target.closest(".chip");
  if (!b) return;
  const id = b.dataset.id;
  if (armedId !== null) {
    const r = b.getBoundingClientRect();
    const onX = id === armedId && ev.clientX >= r.right - X_ZONE;
    const target = armedId;
    disarm();
    if (onX) removeItem(target);
    return;
  }
  if (editMode) openEdit(id);
  else toggle(id);
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
  if (!editMode && hiddenCats.has(category.toLowerCase())) {
    toast(`Added to "${category || "No category"}", which your filter hides.`);
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
  els.editCat._combo?.close();
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

/* ---------- clear (x) buttons inside inputs ---------- */
// Keep focus (and the phone keyboard) on the input when the X is pressed.
document.addEventListener("mousedown", (ev) => { if (ev.target.closest(".clear")) ev.preventDefault(); });
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".clear");
  if (!btn) return;
  const input = btn.parentElement.querySelector("input");
  input.value = "";
  input._combo?.close();
  input.focus();
});

/* ---------- category dropdown (type a new one, or pick an existing one) ---------- */
function setupCombo(input, { onPick } = {}) {
  const field = input.closest(".field");
  const menu = document.createElement("ul");
  menu.className = "menu";
  menu.id = input.id + "-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  const chev = document.createElement("button");
  chev.type = "button";
  chev.className = "chev";
  chev.tabIndex = -1;
  chev.setAttribute("aria-label", "Show existing categories");
  chev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  field.append(chev, menu);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", menu.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");

  function fill(query) {
    const q = query.toLowerCase();
    const all = [...allCategories().values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const list = all.filter((c) => c.toLowerCase().includes(q));
    menu.replaceChildren();
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = all.length ? "No match. It will be added as a new category." : "No categories yet. Type a new one.";
      menu.append(li);
      return;
    }
    const current = input.value.trim().toLowerCase();
    for (const c of list) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.value = c;
      li.textContent = c;
      if (c.toLowerCase() === current) li.setAttribute("aria-selected", "true");
      menu.append(li);
    }
  }
  function open(showAll) {
    fill(showAll ? "" : input.value.trim());
    menu.hidden = false;
    field.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  }
  function close() {
    menu.hidden = true;
    field.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
  }
  input._combo = { open, close };

  chev.addEventListener("mousedown", (e) => e.preventDefault());
  chev.addEventListener("click", () => (menu.hidden ? open(true) : close()));
  menu.addEventListener("mousedown", (e) => e.preventDefault());
  menu.addEventListener("click", (e) => {
    const li = e.target.closest('[role="option"]');
    if (!li) return;
    input.value = li.dataset.value;
    close();
    onPick?.();
  });
  input.addEventListener("input", () => { if (input.value.trim()) open(false); else close(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown" && menu.hidden) { e.preventDefault(); open(true); }
  });
  document.addEventListener("pointerdown", (e) => { if (!field.contains(e.target)) close(); });
}

setupCombo(els.cat, { onPick: () => els.name.focus() });
setupCombo(els.editCat);

/* ---------- category filter (per device) ---------- */
function renderFilter() {
  const counts = new Map();
  for (const v of Object.values(items)) {
    if (!norm(v.name)) continue;
    const label = norm(v.category);
    const k = label.toLowerCase();
    const c = counts.get(k) || { label, n: 0 };
    c.n += 1;
    counts.set(k, c);
  }
  const keys = [...counts.keys()].sort((a, b) =>
    a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, undefined, { sensitivity: "base" }));
  const focusedKey = document.activeElement?.dataset?.key;

  els.filterList.replaceChildren();
  if (!keys.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "No categories yet.";
    els.filterList.append(li);
    return;
  }
  for (const k of keys) {
    const c = counts.get(k);
    const li = document.createElement("li");
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = k;
    cb.checked = !hiddenCats.has(k);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = c.label || "No category";
    const cnt = document.createElement("span");
    cnt.className = "cnt";
    cnt.textContent = String(c.n);
    label.append(cb, name, cnt);
    li.append(label);
    els.filterList.append(li);
  }
  if (focusedKey !== undefined) els.filterList.querySelector(`input[data-key="${CSS.escape(focusedKey)}"]`)?.focus();
}

els.filterBtn.addEventListener("click", () => { renderFilter(); els.filter.showModal(); });
$("#filter-close").addEventListener("click", () => els.filter.close());
els.filterList.addEventListener("change", (ev) => {
  const cb = ev.target.closest("input[data-key]");
  if (!cb) return;
  if (cb.checked) hiddenCats.delete(cb.dataset.key); else hiddenCats.add(cb.dataset.key);
  saveHidden();
  render();
});
$("#filter-all").addEventListener("click", () => { hiddenCats.clear(); saveHidden(); render(); renderFilter(); });
$("#filter-none").addEventListener("click", () => {
  for (const v of Object.values(items)) if (norm(v.name)) hiddenCats.add(norm(v.category).toLowerCase());
  saveHidden(); render(); renderFilter();
});
els.list.addEventListener("click", (ev) => {
  if (ev.target.closest('[data-act="show-all"]')) { hiddenCats.clear(); saveHidden(); render(); }
});

/* ---------- share this list (owner only) ---------- */
const emailKey = (e) => e.trim().toLowerCase().replace(/\./g, ",");
const EMAIL_RE = /^[^\s@,$#\[\]\/]+@[^\s@,$#\[\]\/]+\.[^\s@,$#\[\]\/]+$/;
let pendingRemove = null;
let removeTimer = null;

const SEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>';

function renderMembers() {
  const ul = els.memberList;
  ul.replaceChildren();
  const rows = Object.entries(members)
    .map(([key, v]) => ({ key, email: String(v?.email || key.replace(/,/g, ".")) }))
    .sort((a, b) => a.email.localeCompare(b.email));

  for (const o of ownerEmails) {
    const li = document.createElement("li");
    const em = document.createElement("span"); em.className = "email"; em.textContent = o;
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "Owner";
    li.append(em, badge);
    ul.append(li);
  }
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "No one else yet. Invite someone above.";
    ul.append(li);
  }
  for (const r of rows) {
    const li = document.createElement("li");
    const em = document.createElement("span"); em.className = "email"; em.textContent = r.email;

    const send = document.createElement("button");
    send.type = "button"; send.className = "group-x"; send.dataset.act = "send"; send.dataset.email = r.email;
    send.setAttribute("aria-label", `Send invite to ${r.email}`);
    send.innerHTML = SEND_ICON;

    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "group-x"; rm.dataset.act = "remove"; rm.dataset.key = r.key;
    if (pendingRemove === r.key) {
      rm.classList.add("armed"); rm.textContent = "Remove?";
      rm.setAttribute("aria-label", `Confirm: remove ${r.email}`);
    } else {
      rm.innerHTML = "&#10005;";
      rm.setAttribute("aria-label", `Remove ${r.email}`);
    }
    li.append(em, send, rm);
    ul.append(li);
  }
}

async function sendInvite(email) {
  const url = location.origin + location.pathname.replace(/index\.html$/, "");
  const text = `I added you to our grocery list. Open the link, tap "Sign in with Google" and use ${email}.`;
  if (navigator.share) {
    try { await navigator.share({ title: "Join our grocery list", text, url }); } catch { /* cancelled */ }
    return;
  }
  location.href = `mailto:${email}?subject=${encodeURIComponent("Join our grocery list")}&body=${encodeURIComponent(text + "\n\n" + url)}`;
}

els.shareBtn.addEventListener("click", () => {
  els.shareMsg.textContent = "";
  els.shareEmail.value = "";
  pendingRemove = null;
  renderMembers();
  els.share.showModal();
});
$("#share-close").addEventListener("click", () => els.share.close());

els.shareForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = els.shareEmail.value.trim().toLowerCase();
  const say = (m) => { els.shareMsg.textContent = m; };
  if (!EMAIL_RE.test(email) || email.length > 100) return say("That doesn't look like a valid email address.");
  if (ownerEmails.some((o) => o.toLowerCase() === email)) return say("That's the owner's address; it already has access.");
  if (members[emailKey(email)]) return say(`${email} is already on the list.`);
  try {
    await set(ref(db, `access/members/${emailKey(email)}`), {
      email, invitedBy: currentUser?.email || "", invitedAt: Date.now()
    });
    els.shareEmail.value = "";
    say(`${email} can now sign in. Tap the send icon next to their address to message them the link.`);
  } catch (e) {
    say("Couldn't add: " + e.message);
  }
});

els.memberList.addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-act]");
  if (!b) return;
  if (b.dataset.act === "send") { sendInvite(b.dataset.email); return; }
  const key = b.dataset.key;
  if (pendingRemove === key) {
    pendingRemove = null;
    clearTimeout(removeTimer);
    remove(ref(db, `access/members/${key}`)).catch((e) => toast(e.message));
  } else {
    pendingRemove = key;
    clearTimeout(removeTimer);
    removeTimer = setTimeout(() => { pendingRemove = null; renderMembers(); }, 4000);
    renderMembers();
  }
});

/* ---------- PWA: version label + "new version" banner ---------- */
let swReg = null;

function askVersion(worker) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => resolve(e.data);
    worker.postMessage({ type: "GET_VERSION" }, [ch.port2]);
    setTimeout(() => resolve(null), 1500);
  });
}

async function showVersion() {
  const worker = navigator.serviceWorker.controller || swReg?.active;
  if (!worker) return;
  const v = await askVersion(worker);
  // An older service worker can't answer; show that instead of hiding the label.
  els.version.textContent = v ? `Version ${v}` : "Version unknown (tap to check for updates)";
  els.version.hidden = false;
}

function offerUpdate(worker) {
  askVersion(worker).then((v) => {
    els.updateText.textContent = v ? `Version ${v} is ready.` : "A new version is ready.";
    els.update.hidden = false;
    els.updateBtn.onclick = () => {
      els.updateBtn.disabled = true;
      els.updateBtn.textContent = "Updating…";
      worker.postMessage({ type: "SKIP_WAITING" });
    };
  });
}

els.updateLater.addEventListener("click", () => { els.update.hidden = true; });

els.version.addEventListener("click", async () => {
  if (!swReg) return;
  toast("Checking for updates…");
  try { await swReg.update(); } catch { toast("Couldn't check. Are you offline?"); return; }
  setTimeout(() => { if (els.update.hidden) toast("You're on the latest version."); }, 1500);
});

if ("serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) {                       // an update just took over: reload into it
      if (!reloading) { reloading = true; location.reload(); }
    } else {                                   // very first install: no reload needed
      showVersion();
    }
  });

  window.addEventListener("load", async () => {
    try { swReg = await navigator.serviceWorker.register("sw.js"); } catch { return; }
    showVersion();
    if (swReg.waiting && navigator.serviceWorker.controller) offerUpdate(swReg.waiting);
    swReg.addEventListener("updatefound", () => {
      const nw = swReg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) offerUpdate(nw);
      });
    });
    // An installed app can stay open for days: look for updates whenever it comes back to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") swReg.update().catch(() => {});
    });
  });
}
