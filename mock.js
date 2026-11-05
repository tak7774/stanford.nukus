// ============================================================
// IELTS CD Mock Exam — registration (mock.html)
// Step 1 details · Step 2 calendar (Tashkent time) · Step 3 summary + payment · ticket
// Plus the result lookup (#lookup).
// ============================================================
const { t } = window.I18N;

async function apiRequest(method, path, body) {
  try {
    const res = await fetch('/api/' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { data } : { error: { status: res.status, ...data } };
  } catch (e) {
    return { error: { code: 'NETWORK', detail: String(e) } };
  }
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Phone mask "+998 90 123-45-67" ──
function formatUzPhone(value) {
  let d = String(value).replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  let out = '+998';
  if (d.length > 0) out += ' ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += '-' + d.slice(5, 7);
  if (d.length > 7) out += '-' + d.slice(7, 9);
  return out;
}
function attachUzPhoneMask(input) {
  input.addEventListener('focus', () => { if (!input.value) input.value = '+998 '; });
  input.addEventListener('input', () => {
    const f = formatUzPhone(input.value);
    input.value = f === '+998' ? '+998 ' : f;
  });
  input.addEventListener('blur', () => { if (input.value.replace(/\D/g, '') === '998') input.value = ''; });
}
const phoneIsComplete = v => String(v).replace(/\D/g, '').length === 12;

const CAL_DAYS = 30;      // days shown from today
const CAL_MAX_DAYS = 62;  // a ?exam= link further away stretches the calendar up to this

// ── State ──
const state = {
  step: 1,
  first: '', last: '', phone: '', gender: '', password: '',
  exams: null,          // null = loading, 'error', or array
  dayKey: null,         // 'YYYY-MM-DD' (Tashkent)
  exam: null,           // chosen exam object
  pay: 'click'
};
const preselectId = new URLSearchParams(location.search).get('exam');

// ── Days in Tashkent ──
const dayKeyOf = p => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
function examDayKey(exam) { return dayKeyOf(I18N.tashkentParts(new Date(exam.exam_date))); }
// A Date at noon UTC of a Tashkent calendar day: safe for formatting that day's name
function dateOfKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 7)); }

function buildDays() {
  const today = I18N.tashkentParts(new Date());
  let count = CAL_DAYS;
  if (preselectId && Array.isArray(state.exams)) {
    const ex = state.exams.find(e => String(e.id) === preselectId);
    if (ex) {
      const diff = Math.round((dateOfKey(examDayKey(ex)) - dateOfKey(dayKeyOf(today))) / 86400000) + 1;
      count = Math.min(CAL_MAX_DAYS, Math.max(count, diff));
    }
  }
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d + i, 7));
    days.push({ key: dayKeyOf({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }),
                y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: (d.getUTCDay() + 6) % 7, today: i === 0 });
  }
  return days;
}
function examsByDay() {
  const map = {};
  (Array.isArray(state.exams) ? state.exams : []).forEach(e => { (map[examDayKey(e)] = map[examDayKey(e)] || []).push(e); });
  Object.values(map).forEach(list => list.sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date)));
  return map;
}
const seatsLeft = e => Math.max(0, Number(e.seats_left) || 0);

function weekdayNames() {
  if (I18N.currentLang() === 'kaa') return window.KAA_CALENDAR.weekdaysShort;
  const loc = I18N.currentLang() === 'en' ? 'en-GB' : 'ru-RU';
  // 2024-01-01 was a Monday
  return [...Array(7)].map((_, i) => new Date(Date.UTC(2024, 0, 1 + i, 12)).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }).replace('.', ''));
}
function monthName(y, m) {
  if (I18N.currentLang() === 'kaa') return `${window.KAA_CALENDAR.months[m - 1]} ${y}`;
  const loc = I18N.currentLang() === 'en' ? 'en-GB' : 'ru-RU';
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/\s?г\.?$/, '');
}

// ── Calendar ──
function renderCalendar() {
  const grid = document.getElementById('calGrid');
  if (state.exams === null) { grid.innerHTML = `<p style="grid-column:1/-1;color:var(--muted)">${escapeHtml(t('m-loading'))}</p>`; renderSessions(); return; }
  const byDay = examsByDay();
  const days = buildDays();
  const weekdays = weekdayNames().map(w => `<div class="cal-wd" aria-hidden="true">${escapeHtml(w)}</div>`).join('');
  let html = '';
  let month = null;
  days.forEach(day => {
    if (day.m !== month) {
      html += `<div class="cal-month">${escapeHtml(monthName(day.y, day.m))}</div>`;
      if (month === null) html += weekdays; // weekday names once, under the first month
      month = day.m;
      html += '<span></span>'.repeat(day.wd); // blank cells before the first day of this block
    }
    const list = byDay[day.key] || [];
    const open = list.some(e => seatsLeft(e) > 0);
    const label = I18N.formatDay(dateOfKey(day.key));
    const cls = ['day', day.today ? 'today' : ''];
    if (open) {
      cls.push('open'); if (state.dayKey === day.key) cls.push('selected');
      html += `<button type="button" class="${cls.join(' ')}" data-day="${day.key}" aria-pressed="${state.dayKey === day.key}" aria-label="${escapeHtml(label)}">${day.d}</button>`;
    } else if (list.length) {
      cls.push('full');
      html += `<div class="${cls.join(' ')}" aria-label="${escapeHtml(label + ' — ' + t('m-legend-full'))}">${day.d}<small>${escapeHtml(t('mock-full'))}</small></div>`;
    } else {
      html += `<div class="${cls.join(' ')}" aria-hidden="true">${day.d}</div>`;
    }
  });
  grid.innerHTML = html;
  grid.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
    state.dayKey = b.dataset.day;
    const open = (examsByDay()[state.dayKey] || []).filter(e => seatsLeft(e) > 0);
    state.exam = open.length === 1 ? open[0] : (state.exam && examDayKey(state.exam) === state.dayKey ? state.exam : null);
    document.getElementById('sessionError').hidden = true;
    renderCalendar();
  }));
  renderSessions();
}

function renderSessions() {
  const box = document.getElementById('sessions');
  const phone = '<a href="tel:+998913036001">+998 91 303-60-01</a>';
  if (state.exams === null) { box.innerHTML = ''; updateChosen(); return; }
  if (state.exams === 'error') { box.innerHTML = `<p class="sessions-empty">${escapeHtml(t('m-load-fail'))} ${phone}</p>`; updateChosen(); return; }
  const anyOpen = state.exams.some(e => seatsLeft(e) > 0);
  if (!anyOpen) { box.innerHTML = `<p class="sessions-empty">${escapeHtml(t('m-none-30'))} ${phone}</p>`; updateChosen(); return; }
  if (!state.dayKey) { box.innerHTML = `<p class="sessions-empty">${escapeHtml(t('m-pick-day'))}</p>`; updateChosen(); return; }
  const list = examsByDay()[state.dayKey] || [];
  box.innerHTML = `<h3>${escapeHtml(t('m-sessions-on', { date: I18N.formatDay(dateOfKey(state.dayKey)) }))}</h3>` + list.map(e => {
    const left = seatsLeft(e);
    const dt = new Date(e.exam_date);
    const on = state.exam && state.exam.id === e.id;
    return `<button type="button" class="session" data-exam="${e.id}" aria-pressed="${on}"${left ? '' : ' disabled style="opacity:.5;cursor:not-allowed"'}>
      <span class="session-time">${escapeHtml(I18N.formatTime(dt))}</span>
      <span><span class="session-title">${escapeHtml(e.title)}</span><br><span class="session-meta">${escapeHtml(e.duration_minutes)} ${escapeHtml(t('mock-min'))} · ${escapeHtml(left ? t('m-seats-left', { n: left }) : t('mock-full'))}</span></span>
      <span class="session-price">${escapeHtml(I18N.formatPrice(e.price_uzs))}</span>
      <span class="session-radio" aria-hidden="true"></span>
    </button>`;
  }).join('');
  box.querySelectorAll('[data-exam]').forEach(b => b.addEventListener('click', () => {
    state.exam = state.exams.find(e => String(e.id) === b.dataset.exam);
    document.getElementById('sessionError').hidden = true;
    renderSessions();
  }));
  updateChosen();
}

function updateChosen() {
  const el = document.getElementById('chosenText');
  el.textContent = state.exam ? t('m-chosen', { date: `${I18N.formatDay(new Date(state.exam.exam_date))}, ${I18N.formatTime(new Date(state.exam.exam_date))}` }) : '';
}

async function loadExams() {
  state.exams = null;
  renderCalendar();
  const { data, error } = await apiRequest('GET', 'mock-exams/');
  if (error || !Array.isArray(data)) { console.warn('Could not load mock exams:', error); state.exams = 'error'; renderCalendar(); return; }
  state.exams = data;
  // ?exam=<id> from the main page: preselect that day and session
  if (preselectId && !state.exam) {
    const ex = data.find(e => String(e.id) === preselectId && seatsLeft(e) > 0);
    if (ex) { state.exam = ex; state.dayKey = examDayKey(ex); }
  }
  if (state.exam) {
    const fresh = data.find(e => e.id === state.exam.id);
    state.exam = fresh && seatsLeft(fresh) > 0 ? fresh : null;
  }
  renderCalendar();
}

// ── Steps ──
function goToStep(n) {
  const dir = n >= state.step ? 'fwd' : 'back';
  state.step = n;
  document.querySelectorAll('#stage .step').forEach((s, i) => {
    const on = i + 1 === n;
    s.classList.toggle('active', on);
    s.classList.remove('fwd', 'back');
    if (on) { void s.offsetWidth; s.classList.add(dir); }
  });
  document.querySelectorAll('#steps li').forEach(li => {
    const k = Number(li.dataset.step);
    li.classList.toggle('active', k === n);
    li.classList.toggle('done', k < n || n === 4);
    if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  if (n === 3) renderSummary();
  const top = document.getElementById('steps').getBoundingClientRect().top + window.scrollY - 90;
  if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  if (n === 4) document.getElementById('step4').focus({ preventScroll: true });
}

function setInvalid(field, bad) {
  document.querySelector(`[data-field="${field}"]`).classList.toggle('invalid', bad);
  return !bad;
}

function renderSummary() {
  const e = state.exam;
  if (!e) return;
  const dt = new Date(e.exam_date);
  const rows = [
    ['m-sum-name', `${state.first} ${state.last}`],
    ['m-sum-exam', e.title],
    ['m-sum-date', `${I18N.formatDay(dt, true)}, ${I18N.formatTime(dt)}`],
    ['m-sum-place', e.location || t('m-t-address-val')],
  ];
  document.getElementById('summary').innerHTML =
    rows.map(([k, v]) => `<div class="sum-row"><dt>${escapeHtml(t(k))}</dt><dd>${escapeHtml(v)}</dd></div>`).join('') +
    `<div class="sum-row total"><dt>${escapeHtml(t('m-sum-total'))}</dt><dd>${escapeHtml(I18N.formatPrice(e.price_uzs))}</dd></div>`;
}

let ticket = null; // what the server returned, for redrawing in another language
function renderTicket() {
  if (!ticket) return;
  const dt = new Date(ticket.exam.exam_date);
  document.getElementById('tNo').textContent = ticket.no;
  document.getElementById('tName').textContent = ticket.name;
  document.getElementById('tDate').textContent = `${I18N.formatDay(dt, true)}, ${I18N.formatTime(dt)}`;
  document.getElementById('tPay').textContent = t('m-t-pending', { method: t('m-method-' + ticket.pay) });
}

async function submit() {
  const btn = document.getElementById('submitBtn');
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = t('m-sending');
  state.pay = (document.querySelector('input[name=pay]:checked') || {}).value || 'cash';
  const { data, error } = await apiRequest('POST', 'exam-registrations/', {
    exam_id: state.exam.id,
    full_name: `${state.first} ${state.last}`,
    first_name: state.first,
    last_name: state.last,
    phone: state.phone,
    gender: state.gender,
    payment_method: state.pay,
    password: state.password
  });
  btn.disabled = false;
  btn.innerHTML = label;
  if (error) {
    console.warn('Could not save exam registration:', error);
    if (error.code === 'ACCOUNT_EXISTS' || error.password) {
      // The phone already has a portal account (wrong password) or the password is too weak
      alert(t(error.code === 'ACCOUNT_EXISTS' ? 'm-err-account' : 'm-err-pw'));
      goToStep(1);
      document.getElementById('fPw').focus();
    } else if (error.code === 'ALREADY_REGISTERED') {
      alert(t('m-already'));
    } else if (error.code === 'EXAM_FULL' || error.code === 'EXAM_CLOSED') {
      alert(t(error.code === 'EXAM_FULL' ? 'm-full' : 'm-closed'));
      state.exam = null;
      await loadExams();
      goToStep(2);
    } else {
      alert(t('m-fail'));
    }
    return;
  }
  state.password = ''; // not needed any more
  ['fPw', 'fPw2'].forEach(id => { document.getElementById(id).value = ''; });
  ticket = { no: data.ticket_no || '—', name: `${state.first} ${state.last}`, exam: state.exam, pay: state.pay };
  renderTicket();
  goToStep(4);
}

function initSteps() {
  const s1 = document.getElementById('step1');
  s1.querySelectorAll('input').forEach(el => el.addEventListener('input', () => el.closest('.field').classList.remove('invalid')));
  s1.querySelectorAll('input[name=gender]').forEach(el => el.addEventListener('change', () => el.closest('.field').classList.remove('invalid')));
  s1.addEventListener('submit', e => {
    e.preventDefault();
    state.first = document.getElementById('fFirst').value.trim();
    state.last = document.getElementById('fLast').value.trim();
    state.phone = document.getElementById('fPhone').value.trim();
    state.gender = (s1.querySelector('input[name=gender]:checked') || {}).value || '';
    let ok = setInvalid('first', !state.first);
    ok = setInvalid('last', !state.last) && ok;
    ok = setInvalid('phone', !phoneIsComplete(state.phone)) && ok;
    ok = setInvalid('gender', !state.gender) && ok;
    const pw = document.getElementById('fPw').value;
    const pwWeak = pw.length < 8 || /^\d+$/.test(pw);
    ok = setInvalid('pw', pwWeak) && ok;
    ok = setInvalid('pw2', document.getElementById('fPw2').value !== pw) && ok;
    state.password = pw;
    if (!ok) { const f = s1.querySelector('.field.invalid input'); if (f) f.focus(); return; }
    goToStep(2);
  });
  document.getElementById('toStep3').addEventListener('click', () => {
    if (!state.exam) { document.getElementById('sessionError').hidden = false; return; }
    goToStep(3);
  });
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => goToStep(state.step - 1)));
  document.getElementById('submitBtn').addEventListener('click', submit);
}

// ── Result lookup ──
let lookupData = null;
function renderLookup() {
  const out = document.getElementById('lkOut');
  if (!lookupData) return;
  if (lookupData.msg) { out.innerHTML = `<p class="lookup-msg${lookupData.warn ? ' warn' : ''}">${escapeHtml(t(lookupData.msg))}</p>`; return; }
  const r = lookupData.result;
  const b = v => Number(v).toFixed(1);
  const dt = r.exam_date ? new Date(r.exam_date) : null;
  out.innerHTML = `
    <div class="lk-result">
      <p class="lk-hello">${escapeHtml(t('m-l-hello', { name: r.first_name || '' }))}</p>
      <p class="lk-exam">${escapeHtml(r.exam_title || '')}${dt ? ' · ' + escapeHtml(I18N.formatDay(dt, true)) : ''} · ${escapeHtml(r.ticket_no)}</p>
      <div class="lk-bands">
        <div class="lk-band overall"><small>Overall</small><b>${b(r.overall)}</b></div>
        <div class="lk-band"><small>Listening</small><b>${b(r.listening)}</b></div>
        <div class="lk-band"><small>Reading</small><b>${b(r.reading)}</b></div>
        <div class="lk-band"><small>Writing</small><b>${b(r.writing)}</b></div>
        <div class="lk-band"><small>Speaking</small><b>${b(r.speaking)}</b></div>
      </div>
      <button type="button" class="btn-text" id="lkAgain">${escapeHtml(t('m-l-again'))}</button>
    </div>`;
  document.getElementById('lkAgain').addEventListener('click', () => {
    lookupData = null; out.innerHTML = '';
    const f = document.getElementById('lookupForm'); f.hidden = false; f.reset();
    document.getElementById('lkTicket').focus();
  });
}
function initLookup() {
  const form = document.getElementById('lookupForm');
  const ticketIn = document.getElementById('lkTicket');
  ticketIn.addEventListener('input', () => { ticketIn.value = ticketIn.value.toUpperCase(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ticketNo = ticketIn.value.trim();
    const phone = document.getElementById('lkPhone').value.trim();
    if (!ticketNo || !phoneIsComplete(phone)) { lookupData = { msg: 'm-l-err', warn: true }; renderLookup(); return; }
    const btn = document.getElementById('lkSubmit');
    const label = btn.innerHTML;
    btn.disabled = true; btn.textContent = t('m-l-checking');
    const { data, error } = await apiRequest('POST', 'mock-results/lookup/', { ticket_no: ticketNo, phone });
    btn.disabled = false; btn.innerHTML = label;
    if (error) {
      const msg = error.status === 404 ? 'm-l-notfound' : error.status === 429 ? 'm-l-limit' : error.status === 400 ? 'm-l-err' : 'm-l-fail';
      lookupData = { msg, warn: true };
    } else if (!data.ready) {
      lookupData = { msg: 'm-l-notready' };
    } else {
      lookupData = { result: data };
      form.hidden = true;
    }
    renderLookup();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  I18N.init();
  ['fPhone', 'lkPhone'].forEach(id => attachUzPhoneMask(document.getElementById(id)));
  initSteps();
  initLookup();
  I18N.onChange(() => {
    renderCalendar();
    if (state.step === 3) renderSummary();
    renderTicket();
    renderLookup();
  });
  loadExams();
});
