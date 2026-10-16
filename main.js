import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { createClient } from '@supabase/supabase-js';
import { parseInput } from './parser.js';
import { createDemoClient, DEMO_PHRASES } from './demo.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import './style.css';

// Vorschau-Build: Beispieldaten, simuliertes Mikrofon, Handy-Rahmen
const DEMO = import.meta.env.VITE_DEMO === '1';

// ---------- Helfer ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dateVal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeVal = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const ICON = {
  cal: '<svg viewBox="0 0 24 24"><path d="M7 2.5v3M17 2.5v3M3.5 9.5h17M5 4.5h14A1.5 1.5 0 0 1 20.5 6v13a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5L20 7"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11.5a7 7 0 0 0 14 0M12 18.5v3"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9M15 8l4 4-4 4M19 12H9"/></svg>',
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- Konfiguration & Supabase ----------
const cfgUrl = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;
const cfgKey = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

let sb = null;
let currentUserId = null;
let shown = null; // 'app' | 'auth'
let pendingReset = false; // während "Passwort vergessen" nicht automatisch in die App wechseln
let items = [];
let tab = 'events';
let showPast = false;

const app = $('#app');

// Überlagerungen (Sheet, Zuhören) hängen im Handy-Rahmen bzw. am body
const host = () => document.getElementById('phone') || document.body;

function enterApp(uid) {
  currentUserId = uid;
  shown = 'app';
  renderApp();
  setTimeout(load, 0);
}

function init() {
  if (DEMO) {
    document.body.classList.add('demo');
    const phone = document.createElement('div');
    phone.id = 'phone';
    document.body.prepend(phone);
    const bar = document.createElement('div');
    bar.className = 'statusbar';
    const t = new Date();
    bar.innerHTML = `<span>${pad(t.getHours())}:${pad(t.getMinutes())}</span><i></i><span>5G ▮▮▮ 86%</span>`;
    phone.append(bar, app, $('#toast'));
    sb = createDemoClient();
  } else {
    if (!cfgUrl || !cfgKey) return renderNotConfigured();
    sb = createClient(cfgUrl, cfgKey);
  }
  sb.auth.onAuthStateChange((_event, session) => {
    if (pendingReset) return;
    const uid = session?.user?.id ?? null;
    const next = uid ? 'app' : 'auth';
    if (uid === currentUserId && next === shown) return; // z. B. Token-Refresh
    if (uid) return enterApp(uid);
    currentUserId = null;
    shown = 'auth';
    items = [];
    renderAuth();
  });
}

// Nur für den Entwickler sichtbar, solange der Key in src/config.js fehlt
function renderNotConfigured() {
  app.innerHTML = `
    <div class="center">
      <div class="logo">${ICON.mic}</div>
      <h1>Noch nicht eingerichtet</h1>
      <p>Beim Bauen der App fehlt der Supabase-Schlüssel. Trage ihn in <b>src/config.js</b> ein (oder als GitHub-Variable <b>SUPABASE_ANON_KEY</b>) und baue die APK neu.</p>
    </div>`;
}

// ---------- Anmeldung ----------
const errText = (e) => {
  const m = (e?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-Mail oder Passwort stimmt nicht.';
  if (m.includes('already registered')) return 'Diese E-Mail ist schon registriert. Bitte melde dich an.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return 'Zu viele Versuche. Bitte warte kurz und probiere es dann nochmal.';
  if (m.includes('expired') || m.includes('invalid')) return 'Der Code ist falsch oder abgelaufen.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Keine Verbindung. Bitte prüfe dein Internet.';
  return e?.message || 'Etwas ist schiefgelaufen.';
};

const val = (id) => $(`#${id}`).value.trim();
async function run(btn, fn) {
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

function renderAuth(mode = 'login', ctx = {}) {
  const hint = DEMO ? '<div class="hint">Vorschau: Alles funktioniert mit beliebigen Eingaben, als Code z. B. 123456.</div>' : '';
  const email = (v = '') => `<label class="field"><span>E-Mail</span><input id="email" type="email" autocomplete="email" autocapitalize="off" value="${esc(v)}" /></label>`;
  const pw = (label, auto) => `<label class="field"><span>${label}</span><input id="pw" type="password" autocomplete="${auto}" /></label>`;
  const code = '<label class="field"><span>Code aus der E-Mail</span><input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" /></label>';
  const head = (h, p) => `<div class="logo">${ICON.mic}</div><h1>${h}</h1><p>${p}</p>`;

  const views = {
    login: `${head('Willkommen zurück', 'Melde dich an – deine Termine und Listen sind auf jedem Gerät da.')}
      ${email(ctx.email)}${pw('Passwort', 'current-password')}
      <button class="btn" id="go">Anmelden</button>
      <button class="link" id="to-forgot">Passwort vergessen?</button>
      <button class="link" id="to-signup" style="margin-top:0">Noch kein Konto? Registrieren</button>`,
    signup: `${head('Konto erstellen', 'Wir schicken dir eine E-Mail mit einem Bestätigungs-Code.')}
      ${email(ctx.email)}${pw('Passwort (mind. 6 Zeichen)', 'new-password')}
      <button class="btn" id="go">Registrieren</button>
      <button class="link" id="to-login">Schon ein Konto? Anmelden</button>`,
    verify: `${head('E-Mail bestätigen', `Wir haben einen Code an <b>${esc(ctx.email)}</b> geschickt. Gib ihn hier ein.`)}
      ${code}
      <button class="btn" id="go">Bestätigen</button>
      <button class="link" id="resend">Code erneut senden</button>
      <button class="link" id="to-login" style="margin-top:0;color:var(--muted)">Zurück</button>`,
    forgot: `${head('Passwort vergessen', 'Wir schicken dir einen Code, mit dem du ein neues Passwort setzen kannst.')}
      ${email(ctx.email)}
      <button class="btn" id="go">Code senden</button>
      <button class="link" id="to-login">Zurück</button>`,
    reset: `${head('Neues Passwort', `Code an <b>${esc(ctx.email)}</b> gesendet. Gib ihn ein und wähle ein neues Passwort.`)}
      ${code}${pw('Neues Passwort (mind. 6 Zeichen)', 'new-password')}
      <button class="btn" id="go">Passwort speichern</button>
      <button class="link" id="to-login" style="color:var(--muted)">Abbrechen</button>`,
  };
  app.innerHTML = `<div class="center">${views[mode]}${hint}</div>`;

  const on = (id, fn) => { const el = $(`#${id}`); if (el) el.onclick = fn; };
  on('to-login', () => renderAuth('login', { email: $('#email') ? val('email') : ctx.email }));
  on('to-signup', () => renderAuth('signup', { email: val('email') }));
  on('to-forgot', () => renderAuth('forgot', { email: val('email') }));

  on('resend', async () => {
    const { error } = await sb.auth.resend({ type: 'signup', email: ctx.email });
    toast(error ? errText(error) : 'Neuer Code ist unterwegs.');
  });

  on('go', () => run($('#go'), async () => {
    if (mode === 'login') {
      const em = val('email').toLowerCase();
      const password = $('#pw').value;
      if (!em || !password) return toast('Bitte E-Mail und Passwort eingeben.');
      const { error } = await sb.auth.signInWithPassword({ email: em, password });
      if (!error) return; // onAuthStateChange öffnet die App
      if (/not confirmed/i.test(error.message)) {
        await sb.auth.resend({ type: 'signup', email: em });
        toast('Bitte bestätige zuerst deine E-Mail. Wir haben dir einen neuen Code geschickt.');
        return renderAuth('verify', { email: em });
      }
      return toast(errText(error));
    }

    if (mode === 'signup') {
      const em = val('email').toLowerCase();
      const password = $('#pw').value;
      if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Bitte eine gültige E-Mail eingeben.');
      if (password.length < 6) return toast('Das Passwort braucht mindestens 6 Zeichen.');
      const { data, error } = await sb.auth.signUp({ email: em, password });
      if (error) return toast(errText(error));
      if (!data.session) renderAuth('verify', { email: em });
      return;
    }

    if (mode === 'verify') {
      const token = val('code').replace(/\s/g, '');
      if (token.length < 6) return toast('Bitte den Code aus der E-Mail eingeben.');
      const { error } = await sb.auth.verifyOtp({ email: ctx.email, token, type: 'signup' });
      if (error) toast(errText(error));
      return; // bei Erfolg öffnet onAuthStateChange die App
    }

    if (mode === 'forgot') {
      const em = val('email').toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Bitte eine gültige E-Mail eingeben.');
      const { error } = await sb.auth.resetPasswordForEmail(em);
      if (error) return toast(errText(error));
      toast('Falls es ein Konto gibt, ist ein Code unterwegs.');
      return renderAuth('reset', { email: em });
    }

    if (mode === 'reset') {
      const token = val('code').replace(/\s/g, '');
      const password = $('#pw').value;
      if (token.length < 6) return toast('Bitte den Code aus der E-Mail eingeben.');
      if (password.length < 6) return toast('Das Passwort braucht mindestens 6 Zeichen.');
      pendingReset = true;
      const v = await sb.auth.verifyOtp({ email: ctx.email, token, type: 'recovery' });
      if (v.error) { pendingReset = false; return toast(errText(v.error)); }
      const u = await sb.auth.updateUser({ password });
      pendingReset = false;
      if (u.error) {
        toast(errText(u.error));
        await sb.auth.signOut();
        return;
      }
      toast('Passwort geändert ✓');
      enterApp(v.data.user.id);
    }
  }));
}

// ---------- Hauptansicht ----------
function renderApp() {
  app.innerHTML = `
    <header class="top"><h1 id="title"></h1><button class="icon-btn" id="logout" aria-label="Abmelden">${ICON.out}</button></header>
    <main id="view"></main>
    <nav class="tabs">
      <button class="tab" data-tab="events">${ICON.cal}<span>Termine</span></button>
      <button class="fab" id="mic" aria-label="Einsprechen">${ICON.mic}</button>
      <button class="tab" data-tab="tasks">${ICON.check}<span>To-dos &amp; Listen</span></button>
    </nav>`;
  app.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
  $('#mic').onclick = startListening;
  $('#logout').onclick = async () => { await sb.auth.signOut(); items = []; };
  $('#view').addEventListener('click', onViewClick);
  render();
}

async function load() {
  const { data, error } = await sb.from('items').select('*').order('created_at', { ascending: false });
  if (error) return toast('Laden fehlgeschlagen: ' + error.message);
  items = data;
  render();
}

function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function eventCard(e, past) {
  const d = new Date(e.starts_at);
  const time = e.all_day ? '<div class="time all">ganztägig</div>' : `<div class="time">${timeVal(d)}</div>`;
  return `<div class="card${past ? ' past' : ''}" data-id="${e.id}" data-act="edit">${time}<div class="grow"><div class="t">${esc(e.title)}</div></div></div>`;
}

function renderEvents() {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const evs = items.filter((i) => i.kind === 'event' && i.starts_at).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const upcoming = evs.filter((e) => new Date(e.starts_at) >= startToday);
  const past = evs.filter((e) => new Date(e.starts_at) < startToday).reverse();

  const group = (list, isPast) => {
    let html = '', last = '';
    for (const e of list) {
      const d = new Date(e.starts_at);
      const key = dateVal(d);
      if (key !== last) { html += `<div class="day${isPast ? ' past' : ''}">${esc(dayLabel(d))}</div>`; last = key; }
      html += eventCard(e, isPast);
    }
    return html;
  };

  let html = upcoming.length
    ? group(upcoming, false)
    : '<div class="empty"><div class="big">📅</div>Noch keine Termine.<br />Tippe auf das Mikrofon und sag z. B.<br /><b>„Zahnarzt morgen 15 Uhr“</b></div>';
  if (past.length) {
    html += `<button class="more" data-act="past">${showPast ? 'Vergangene ausblenden' : `Vergangene anzeigen (${past.length})`}</button>`;
    if (showPast) html += group(past, true);
  }
  return html;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
      );

const itemsOf = (listId) =>
  items
    .filter((i) => i.kind === 'item' && i.parent_id === listId)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

function listCard(l) {
  const its = itemsOf(l.id);
  const done = its.filter((i) => i.done).length;
  const d = l.starts_at ? new Date(l.starts_at) : null;
  const chip = d ? `<div class="time">${d.getDate()}.${d.getMonth() + 1}.</div>` : '<div class="time all">Liste</div>';
  const sub = its.length ? `${done} von ${its.length} erledigt` : 'Noch leer';
  const bar = its.length ? `<div class="bar"><i style="width:${Math.round((done / its.length) * 100)}%"></i></div>` : '';
  return `
    <div class="card" data-id="${l.id}" data-act="openlist">
      ${chip}
      <div class="grow"><div class="t">${esc(l.title)}</div><div class="s">${esc(sub)}${d ? ' · ' + esc(dayLabel(d)) : ''}</div>${bar}</div>
      <span class="chev">›</span>
    </div>`;
}

function renderTasks() {
  const lists = items
    .filter((i) => i.kind === 'list')
    .sort((a, b) => {
      if (a.starts_at && b.starts_at) return new Date(a.starts_at) - new Date(b.starts_at);
      if (a.starts_at) return -1;
      if (b.starts_at) return 1;
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  const tasks = items.filter((i) => i.kind === 'task');
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const card = (t) => `
    <div class="card${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="Abhaken">${ICON.check}</button>
      <button class="grow" data-act="edit"><div class="t">${esc(t.title)}</div></button>
    </div>`;
  if (!tasks.length && !lists.length) {
    return '<div class="empty"><div class="big">✅</div>Noch nichts zu erledigen.<br />Sag z. B. <b>„Milch kaufen“</b><br />oder <b>„Erstelle eine Einkaufsliste für morgen“</b></div>';
  }
  let html = '';
  if (lists.length) html += '<div class="day">Listen</div>' + lists.map(listCard).join('');
  if (tasks.length) html += '<div class="day">To-dos</div>' + open.map(card).join('');
  if (done.length) html += '<div class="day">Erledigt</div>' + done.map(card).join('');
  return html;
}

function render() {
  if (!$('#view')) return;
  $('#title').textContent = tab === 'events' ? 'Termine' : 'To-dos & Listen';
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#view').innerHTML = tab === 'events' ? renderEvents() : renderTasks();
  renderDetail();
}

async function onViewClick(e) {
  const actEl = e.target.closest('[data-act]');
  if (!actEl) return;
  const act = actEl.dataset.act;
  if (act === 'past') { showPast = !showPast; return render(); }
  const id = actEl.closest('[data-id]')?.dataset.id;
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (act === 'openlist') return openDetail(id);
  if (act === 'edit') return openSheet({ item });
  if (act === 'toggle') {
    item.done = !item.done;
    render();
    const { error } = await sb.from('items').update({ done: item.done }).eq('id', id);
    if (error) { toast(error.message); load(); }
  }
}

// ---------- Listen-Detailansicht ----------
let detailEl = null;
let detailId = null;

function openDetail(id) {
  detailId = id;
  if (!detailEl) {
    detailEl = document.createElement('div');
    detailEl.className = 'detail';
    detailEl.addEventListener('click', onDetailClick);
    detailEl.addEventListener('submit', onDetailSubmit);
    host().appendChild(detailEl);
  }
  renderDetail();
}

function closeDetail() {
  detailEl?.remove();
  detailEl = null;
  detailId = null;
}

function renderDetail() {
  if (!detailEl) return;
  const list = items.find((i) => i.id === detailId);
  if (!list) return closeDetail();
  const its = itemsOf(list.id);
  const open = its.filter((i) => !i.done);
  const done = its.filter((i) => i.done);
  const d = list.starts_at ? new Date(list.starts_at) : null;
  const row = (i) => `
    <div class="card${i.done ? ' done' : ''}" data-id="${i.id}">
      <button class="check" data-d="toggle" aria-label="Abhaken">${ICON.check}</button>
      <div class="grow"><div class="t">${esc(i.title)}</div></div>
      <button class="x" data-d="del" aria-label="Entfernen">×</button>
    </div>`;
  const prev = detailEl.querySelector('#d-new')?.value ?? '';
  const hadFocus = document.activeElement?.id === 'd-new';
  detailEl.innerHTML = `
    <header class="dtop">
      <button class="icon-btn" data-d="back" aria-label="Zurück">${ICON.back}</button>
      <div class="dtitle">
        <h2>${esc(list.title)}</h2>
        <div class="s">${d ? esc(/^(Heute|Morgen|Gestern)$/.test(dayLabel(d)) ? dayLabel(d) + ' · ' + d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : dayLabel(d)) : 'Ohne Datum'}</div>
      </div>
      <button class="icon-btn" data-d="edit" aria-label="Liste bearbeiten">${ICON.edit}</button>
    </header>
    <div class="dbody">
      ${its.length ? open.map(row).join('') : '<div class="empty"><div class="big">🛒</div>Die Liste ist noch leer.<br />Sag z. B. <b>„Milch und Eier auf die Einkaufsliste“</b><br />oder tippe unten einen Punkt ein.</div>'}
      ${done.length ? '<div class="day">Erledigt</div>' + done.map(row).join('') : ''}
    </div>
    <form class="dadd" id="d-form">
      <input id="d-new" type="text" placeholder="Neuer Punkt …" autocomplete="off" />
      <button class="add" type="submit" aria-label="Hinzufügen">+</button>
    </form>`;
  const input = detailEl.querySelector('#d-new');
  input.value = prev;
  if (hadFocus) input.focus();
}

async function onDetailClick(e) {
  const b = e.target.closest('[data-d]');
  if (!b) return;
  const act = b.dataset.d;
  if (act === 'back') return closeDetail();
  if (act === 'edit') return openSheet({ item: items.find((i) => i.id === detailId) });
  const id = b.closest('[data-id]')?.dataset.id;
  const it = items.find((i) => i.id === id);
  if (!it) return;
  if (act === 'toggle') {
    it.done = !it.done;
    render();
    const { error } = await sb.from('items').update({ done: it.done }).eq('id', id);
    if (error) { toast(error.message); load(); }
  } else if (act === 'del') {
    items = items.filter((i) => i.id !== id);
    render();
    const { error } = await sb.from('items').delete().eq('id', id);
    if (error) { toast(error.message); load(); }
  }
}

async function onDetailSubmit(e) {
  e.preventDefault();
  const input = detailEl.querySelector('#d-new');
  const text = input.value.trim();
  if (!text || !detailId) return;
  input.value = '';
  const title = text.charAt(0).toUpperCase() + text.slice(1);
  const { error } = await sb.from('items').insert({ kind: 'item', parent_id: detailId, title, created_at: new Date().toISOString() });
  if (error) { toast(error.message); input.value = text; return; }
  await load();
  detailEl?.querySelector('#d-new')?.focus();
}

// ---------- Bearbeiten / Bestätigen ----------
function pickTarget(lists, state, parsed) {
  const cands = lists.filter((l) => l.title.toLowerCase() === (state.title || '').toLowerCase());
  if (!cands.length) return 'new';
  if (parsed?.date) {
    const dv = dateVal(parsed.date);
    const same = cands.find((l) => l.starts_at && dateVal(new Date(l.starts_at)) === dv);
    if (same) return same.id;
  }
  const today = startOfToday();
  const upcoming = cands
    .filter((l) => l.starts_at && new Date(l.starts_at) >= today)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  if (upcoming.length) return upcoming[0].id;
  return [...cands].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0].id;
}

function openSheet({ item = null, transcript = '', parsed = null }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lists = items
    .filter((i) => i.kind === 'list')
    .sort((a, b) => String(a.starts_at ?? '9').localeCompare(String(b.starts_at ?? '9')));
  const kind = item?.kind ?? parsed?.kind ?? 'task';
  const state = {
    kind,
    title: item?.title ?? parsed?.title ?? '',
    date: item?.starts_at ? new Date(item.starts_at) : parsed?.date ?? now,
    allDay: item ? item.all_day : parsed?.allDay ?? false,
    hasDate: item ? Boolean(item.starts_at) : Boolean(parsed?.date) || (kind === 'list' && parsed?.mode !== 'add'),
    target: 'new',
  };
  if (!item && !parsed?.date) {
    state.date = kind === 'list' ? today : new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
  }
  if (!item && kind === 'list' && parsed?.mode === 'add') state.target = pickTarget(lists, state, parsed);

  const kinds = item
    ? item.kind === 'list' ? [] : [['event', 'Termin'], ['task', 'To-do']]
    : [['event', 'Termin'], ['task', 'To-do'], ['list', 'Liste']];
  const listLabel = (l) => {
    const d = l.starts_at ? new Date(l.starts_at) : null;
    return `${l.title} · ${d ? d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }) : 'ohne Datum'}`;
  };

  const wrap = document.createElement('div');
  wrap.className = 'backdrop';
  wrap.innerHTML = `
    <div class="sheet" role="dialog">
      <div class="grab"></div>
      ${transcript ? `<div class="heard">Verstanden: <b>„${esc(transcript)}“</b></div>` : ''}
      ${kinds.length ? `<div class="seg">${kinds.map(([k, t]) => `<button data-kind="${k}">${t}</button>`).join('')}</div>` : ''}
      <label class="field" id="title-field"><span id="title-label">Titel</span><input id="f-title" type="text" /></label>
      <div id="when">
        <div class="row2">
          <label class="field"><span>Datum</span><input id="f-date" type="date" /></label>
          <label class="field" id="time-field"><span>Uhrzeit</span><input id="f-time" type="time" /></label>
        </div>
        <label class="switch"><input id="f-all" type="checkbox" /> Ganztägig</label>
      </div>
      <div id="lst">
        <label class="field" id="target-field"><span>Wohin?</span>
          <select id="f-target">
            <option value="new">Neue Liste anlegen</option>
            ${lists.map((l) => `<option value="${l.id}">Zu „${esc(listLabel(l))}“ hinzufügen</option>`).join('')}
          </select>
        </label>
        <div id="newlist">
          <label class="switch"><input id="f-hasdate" type="checkbox" /> Mit Datum</label>
          <label class="field" id="ldate-field"><span>Datum</span><input id="f-ldate" type="date" /></label>
        </div>
        <label class="field" id="items-field"><span>Punkte (einer pro Zeile)</span><textarea id="f-items" rows="4" placeholder="Milch&#10;Eier&#10;Brot"></textarea></label>
      </div>
      <div class="sheet-actions">
        <button class="btn" id="f-save">Eintragen</button>
        <button class="btn secondary" id="f-cancel">Abbrechen</button>
        ${item ? '<button class="btn danger" id="f-del">Löschen</button>' : ''}
      </div>
    </div>`;
  host().appendChild(wrap);

  const refresh = () => {
    const isL = state.kind === 'list';
    const newL = state.target === 'new';
    wrap.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.kind === state.kind));
    $('#title-field', wrap).style.display = isL && !item && !newL ? 'none' : '';
    $('#title-label', wrap).textContent = isL ? 'Name der Liste' : 'Titel';
    $('#when', wrap).style.display = state.kind === 'event' ? '' : 'none';
    $('#time-field', wrap).style.display = state.allDay ? 'none' : '';
    $('#lst', wrap).style.display = isL ? '' : 'none';
    $('#target-field', wrap).style.display = !item && lists.length ? '' : 'none';
    $('#newlist', wrap).style.display = newL ? '' : 'none';
    $('#ldate-field', wrap).style.display = state.hasDate ? '' : 'none';
    $('#items-field', wrap).style.display = item ? 'none' : '';
    $('#f-save', wrap).textContent = item ? 'Speichern' : isL && !newL ? 'Hinzufügen' : 'Eintragen';
  };
  $('#f-title', wrap).value = state.title;
  $('#f-date', wrap).value = dateVal(state.date);
  $('#f-time', wrap).value = timeVal(state.date);
  $('#f-all', wrap).checked = state.allDay;
  $('#f-ldate', wrap).value = dateVal(state.date);
  $('#f-hasdate', wrap).checked = state.hasDate;
  $('#f-target', wrap).value = state.target;
  $('#f-items', wrap).value = (parsed?.items ?? []).join('\n');
  refresh();

  wrap.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { state.kind = b.dataset.kind; refresh(); }));
  $('#f-all', wrap).onchange = (e) => { state.allDay = e.target.checked; refresh(); };
  $('#f-hasdate', wrap).onchange = (e) => { state.hasDate = e.target.checked; refresh(); };
  $('#f-target', wrap).onchange = (e) => { state.target = e.target.value; refresh(); };
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  $('#f-cancel', wrap).onclick = close;

  if (item) {
    $('#f-del', wrap).onclick = async () => {
      const { error } = await sb.from('items').delete().eq('id', item.id);
      if (error) return toast(error.message);
      close();
      items = items.filter((i) => i.id !== item.id && i.parent_id !== item.id);
      if (detailId === item.id) closeDetail();
      render();
    };
  }

  $('#f-save', wrap).onclick = async () => {
    const btn = $('#f-save', wrap);
    const isL = state.kind === 'list';
    let title = $('#f-title', wrap).value.trim();
    let error = null;
    let openId = null;

    if (isL && !item) {
      const lines = $('#f-items', wrap).value.split('\n').map((s) => s.trim()).filter(Boolean);
      const t0 = Date.now();
      const itemRows = (parent) =>
        lines.map((l, i) => ({ kind: 'item', parent_id: parent, title: l, created_at: new Date(t0 + i + 1).toISOString() }));
      if (state.target !== 'new') {
        if (!lines.length) return toast('Bitte mindestens einen Punkt eingeben');
        btn.disabled = true;
        openId = state.target;
        ({ error } = await sb.from('items').insert(itemRows(openId)));
      } else {
        if (!title) return toast('Bitte einen Namen für die Liste angeben');
        let starts_at = null;
        if (state.hasDate) {
          const dv = $('#f-ldate', wrap).value;
          if (!dv) return toast('Bitte ein Datum wählen');
          starts_at = new Date(`${dv}T00:00`).toISOString();
        }
        btn.disabled = true;
        openId = uuid();
        ({ error } = await sb.from('items').insert([
          { id: openId, kind: 'list', title, starts_at, all_day: true, created_at: new Date(t0).toISOString() },
          ...itemRows(openId),
        ]));
      }
    } else {
      if (!title) return toast('Bitte einen Titel angeben');
      let starts_at = null;
      let all_day = false;
      if (isL) {
        all_day = true;
        if (state.hasDate) {
          const dv = $('#f-ldate', wrap).value;
          if (!dv) return toast('Bitte ein Datum wählen');
          starts_at = new Date(`${dv}T00:00`).toISOString();
        }
      } else if (state.kind === 'event') {
        all_day = state.allDay;
        const dv = $('#f-date', wrap).value;
        if (!dv) return toast('Bitte ein Datum wählen');
        const tv = all_day ? '00:00' : $('#f-time', wrap).value || '09:00';
        starts_at = new Date(`${dv}T${tv}`).toISOString();
      }
      const row = { kind: state.kind, title, starts_at, all_day };
      btn.disabled = true;
      ({ error } = item
        ? await sb.from('items').update(row).eq('id', item.id)
        : await sb.from('items').insert(row));
    }

    btn.disabled = false;
    if (error) return toast(error.message);
    close();
    tab = state.kind === 'event' ? 'events' : 'tasks';
    toast(item ? 'Gespeichert' : isL ? 'Liste gespeichert ✓' : 'Eingetragen ✓');
    await load();
    if (openId) openDetail(openId);
  };
}

// ---------- Spracheingabe ----------
let listening = false;
let transcript = '';
let overlay = null;
let webRec = null;
let demoTimer = null;
let demoIdx = 0;

// Demo: Sprachaufnahme wird Wort für Wort "getippt"
function demoListen() {
  const words = DEMO_PHRASES[demoIdx++ % DEMO_PHRASES.length].split(' ');
  let i = 0;
  listening = true;
  showOverlay();
  demoTimer = setInterval(() => {
    i++;
    transcript = words.slice(0, i).join(' ');
    updateLive();
    if (i >= words.length) {
      clearInterval(demoTimer);
      demoTimer = null;
      setTimeout(() => finishListening(false), 700);
    }
  }, 380);
}

function showOverlay() {
  overlay = document.createElement('div');
  overlay.className = 'listen';
  overlay.innerHTML = `
    <div class="orb">${ICON.mic}</div>
    <div class="live ph" id="live">Ich höre zu …</div>
    <div class="btns">
      <button class="btn" id="l-stop">Fertig</button>
      <button class="btn secondary" id="l-cancel">Abbrechen</button>
    </div>`;
  host().appendChild(overlay);
  $('#l-stop', overlay).onclick = stopListening;
  $('#l-cancel', overlay).onclick = () => finishListening(true);
}

function updateLive() {
  const el = overlay && $('#live', overlay);
  if (!el) return;
  el.textContent = transcript || 'Ich höre zu …';
  el.classList.toggle('ph', !transcript);
}

async function startListening() {
  if (listening) return;
  transcript = '';
  if (DEMO) return demoListen();
  try {
    if (Capacitor.isNativePlatform()) {
      const { available } = await SpeechRecognition.available();
      if (!available) throw new Error('Spracherkennung ist auf diesem Gerät nicht verfügbar.');
      let perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') throw new Error('Bitte erlaube den Mikrofon-Zugriff in den App-Einstellungen.');
      await SpeechRecognition.removeAllListeners();
      SpeechRecognition.addListener('partialResults', (d) => {
        if (d.matches?.length) { transcript = d.matches[0]; updateLive(); }
      });
      SpeechRecognition.addListener('listeningState', (d) => {
        if (d.status === 'stopped') finishListening(false);
      });
      listening = true;
      showOverlay();
      await SpeechRecognition.start({ language: 'de-DE', maxResults: 1, partialResults: true, popup: false });
    } else {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Rec) throw new Error('Dieser Browser unterstützt keine Spracherkennung.');
      webRec = new Rec();
      webRec.lang = 'de-DE';
      webRec.interimResults = true;
      webRec.onresult = (ev) => {
        transcript = Array.from(ev.results).map((r) => r[0].transcript).join(' ');
        updateLive();
      };
      webRec.onend = () => finishListening(false);
      webRec.onerror = () => finishListening(false);
      listening = true;
      showOverlay();
      webRec.start();
    }
  } catch (err) {
    listening = false;
    overlay?.remove();
    overlay = null;
    toast(err?.message || 'Spracherkennung konnte nicht gestartet werden.');
    openSheet({});
  }
}

async function stopListening() {
  if (DEMO) return finishListening(false);
  try {
    if (Capacitor.isNativePlatform()) await SpeechRecognition.stop();
    else webRec?.stop();
  } catch { /* ignorieren */ }
  setTimeout(() => finishListening(false), 700);
}

function finishListening(cancelled) {
  if (!listening) return;
  listening = false;
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  if (DEMO) {
    /* nichts zu beenden */
  } else if (Capacitor.isNativePlatform()) {
    SpeechRecognition.stop().catch(() => {});
    SpeechRecognition.removeAllListeners().catch(() => {});
  } else {
    try { webRec?.abort(); } catch { /* ignorieren */ }
  }
  overlay?.remove();
  overlay = null;
  if (cancelled) return;
  const text = transcript.trim();
  if (!text) return toast('Ich habe nichts verstanden – versuch es nochmal.');
  openSheet({ transcript: text, parsed: parseInput(text) });
}

init();
