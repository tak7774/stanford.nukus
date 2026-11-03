// ============================================================
// Stanford Admin Panel — Full Admin Logic
// Django API (/api/...) + Mock Exams + Students + News
// ============================================================

// ── API helper ──
// Uses the Django login session cookie. Every change (POST/PATCH/DELETE)
// sends the CSRF token Django gave us, as Django requires.
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '=([^;]*)');
  return m ? decodeURIComponent(m[2]) : null;
}

async function api(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (method !== 'GET') opts.headers['X-CSRFToken'] = getCookie('csrftoken') || '';
  try {
    const res = await fetch('/api/' + path, opts);
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = { status: res.status, ...(data || {}) };
      error.message = errorMessage(error);
      return { error };
    }
    return { data };
  } catch (e) {
    return { error: { message: 'Network error — check your connection.' } };
  }
}

// Turns an API error into one readable message (error.message).
function errorMessage(error) {
  if (!error) return '';
  if (error.message) return error.message;
  if (error.detail) return error.detail;
  // Field validation errors look like { title: ["This field is required."] }
  const msgs = Object.entries(error)
    .filter(([k]) => k !== 'status')
    .map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`);
  if (msgs.length) return msgs.join('; ');
  const byStatus = {
    401: 'Сессия истекла — войдите заново.',
    403: 'Нет доступа — войдите заново.',
    404: 'Сервер не нашёл этот адрес (возможно, сервер нужно перезапустить).',
    413: 'Файл слишком большой.',
    500: 'Ошибка на сервере. Попробуйте ещё раз.'
  };
  return byStatus[error.status] || ('Ошибка ' + (error.status || '') + ' — что-то пошло не так.');
}

// Every failed save/delete shows a red toast; the success toast is not shown
// and the modal stays open, so nothing typed is lost.
function showApiError(error) {
  if (!error) return;
  toast(errorMessage(error), 'error');
}

// ── State ──
let session = null; // { email, role }
let currentPage = 'dashboard';

// ── DOM refs ──
const $ = id => document.getElementById(id);
const loginWrap = $('loginWrap');
const appLayout = $('appLayout');
const mainContent = $('mainContent');
const modalOverlay = $('modalOverlay');
const modalContent = $('modalContent');
const toastEl = $('toast');

// ── Auth ──
$('loginBtn').addEventListener('click', doLogin);
$('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('logoutBtn').addEventListener('click', doLogout);

async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pw = $('loginPassword').value;
  const errEl = $('loginError');
  errEl.style.display = 'none';

  if (!email || !pw) { errEl.textContent = 'Enter email and password'; errEl.style.display = 'block'; return; }

  const { data, error } = await api('POST', 'auth/login/', { email, password: pw });
  if (error) { errEl.textContent = error.detail || 'Login failed'; errEl.style.display = 'block'; return; }

  session = { email: data.email, role: data.role };
  $('loginPassword').value = '';
  showApp();
}

async function doLogout() {
  await api('POST', 'auth/logout/');
  session = null;
  appLayout.style.display = 'none';
  loginWrap.style.display = 'flex';
}

function showApp() {
  loginWrap.style.display = 'none';
  appLayout.style.display = 'flex';
  $('userEmail').textContent = session.email;
  $('userRole').textContent = session.role;
  $('userAvatar').textContent = session.email.charAt(0).toUpperCase();
  navigate('dashboard');
}

// ── Navigation ──
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

$('hamburgerAdmin').addEventListener('click', () => $('sidebar').classList.toggle('open'));

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('sidebar').classList.remove('open');
  const views = { dashboard: renderDashboard, exams: renderExams, students: renderStudents, news: renderNews, gallery: renderGallery, results: renderResults, teachers: renderTeachers };
  (views[page] || renderDashboard)();
}

// ── Toast ──
// toast('Saved') = green; toast(error.message, 'error') = red.
let toastTimer = null;
function toast(msg, type) {
  const isError = type === 'error';
  toastEl.textContent = (isError ? '⚠️ ' : '✅ ') + msg; // plain text, never parsed as HTML
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('active');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('active'), isError ? 6000 : 3000);
}

// ── Modal ──
function openModal(html, wide) {
  modalContent.innerHTML = html;
  modalContent.classList.toggle('wide', !!wide);
  modalOverlay.classList.add('active');
}
function closeModal() { modalOverlay.classList.remove('active'); }
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// ── Helpers ──
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtDateTime(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function fmtRelative(d) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

const courseLabels = { ielts: 'IELTS Preparation', general: 'General English', advanced: 'Advanced English', kids: 'Kids English', unsure: 'Не знает — помочь выбрать' };
const courseBadge = { ielts: 'badge-gold', general: 'badge-blue', advanced: 'badge-purple', kids: 'badge-green', unsure: 'badge-gray' };
const sourceLabels = { course_card: 'Карточка курса', apply_form: 'Форма «Оставить заявку»' };
const timeLabels = { morning: 'Утро', day: 'День', evening: 'Вечер' };

// IELTS bands: 0–9 in steps of 0.5. Overall = average rounded the IELTS way
// (x.25 → x.5, x.75 → next whole). The server calculates the same; this is only a preview.
const BAND_VALUES = Array.from({ length: 19 }, (_, i) => (i / 2).toFixed(1));
function isBand(v) { const n = Number(v); return v !== '' && v !== null && !isNaN(n) && n >= 0 && n <= 9 && Math.round(n * 2) === n * 2; }
function ieltsOverall(bands) {
  if (bands.some(b => !isBand(b))) return null;
  const avg = bands.reduce((a, b) => a + Number(b), 0) / 4;
  return (Math.floor(avg * 2 + 0.5) / 2).toFixed(1);
}
function bandText(v) { return (v === null || v === undefined || v === '') ? '—' : Number(v).toFixed(1); }
const statusBadge = { new: 'badge-gold', contacted: 'badge-blue', enrolled: 'badge-green', declined: 'badge-gray', upcoming: 'badge-blue', in_progress: 'badge-gold', completed: 'badge-green', cancelled: 'badge-gray' };

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
async function renderDashboard() {
  mainContent.innerHTML = '<div class="page-header"><h1>Dashboard</h1><p>Overview of your centre</p></div><div class="stats-grid" id="dashStats">Loading...</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px" id="dashCards"></div>';

  const { data: d, error } = await api('GET', 'admin/dashboard/');
  if (error) { $('dashStats').textContent = error.detail || 'Could not load dashboard'; return; }

  const studentsData = d.recent_students;
  const examRegsData = d.recent_exam_registrations;
  const upcomingExams = d.upcoming_exams;
  const newStudents = d.new_students;

  $('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon gold">📝</div><div class="stat-num">${esc(d.total_exams)}</div><div class="stat-label">Total Mock Exams</div></div>
    <div class="stat-card"><div class="stat-icon blue">📅</div><div class="stat-num">${esc(upcomingExams)}</div><div class="stat-label">Upcoming Exams</div></div>
    <div class="stat-card"><div class="stat-icon green">👥</div><div class="stat-num">${esc(d.total_students)}</div><div class="stat-label">Trial Registrations</div></div>
    <div class="stat-card"><div class="stat-icon purple">🆕</div><div class="stat-num">${esc(newStudents)}</div><div class="stat-label">New (uncontacted)</div></div>
  `;

  // Recent activity
  const recentStudents = studentsData.slice(0, 5).map(s => `
    <div class="activity-item">
      <div class="activity-dot" style="background:var(--green)"></div>
      <div><div class="activity-text"><strong>${esc(s.full_name)}</strong> registered for ${esc(courseLabels[s.course] || s.course)}</div><div class="activity-time">${fmtRelative(s.created_at)}</div></div>
    </div>`).join('');

  const recentExamRegs = examRegsData.slice(0, 5).map(r => `
    <div class="activity-item">
      <div class="activity-dot" style="background:var(--blue)"></div>
      <div><div class="activity-text"><strong>${esc(r.full_name)}</strong> signed up for mock exam</div><div class="activity-time">${fmtRelative(r.registered_at)}</div></div>
    </div>`).join('');

  $('dashCards').innerHTML = `
    <div class="card"><div class="card-title">Recent Trial Registrations</div>${recentStudents || '<div class="empty-state"><p>No registrations yet</p></div>'}</div>
    <div class="card"><div class="card-title">Recent Exam Signups</div>${recentExamRegs || '<div class="empty-state"><p>No exam signups yet</p></div>'}</div>
  `;
}

// Escape a value for use inside HTML text AND inside quoted attributes.
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ════════════════════════════════════════════
// MOCK EXAMS
// ════════════════════════════════════════════
async function renderExams() {
  mainContent.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>Mock Exams</h1><p>Create and manage mock exams for students</p></div><button class="btn btn-primary" id="addExamBtn">+ New Exam</button></div><div class="filter-bar"><select id="examFilter"><option value="">All statuses</option><option value="upcoming">Upcoming</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div><div id="examsList">Loading...</div>';

  $('addExamBtn').addEventListener('click', () => openExamModal());
  $('examFilter').addEventListener('change', () => loadExamsList());
  await loadExamsList();
}

async function loadExamsList() {
  const filterEl = $('examFilter');
  const filter = filterEl ? filterEl.value : '';
  const { data, error } = await api('GET', 'admin/exams/' + (filter ? '?status=' + encodeURIComponent(filter) : ''));
  if (error) { $('examsList').textContent = error.detail || 'Could not load exams'; return; }
  const exams = data || [];

  if (!exams.length) {
    $('examsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">📝</div><h3>No mock exams yet</h3><p>Create your first mock exam to get started</p></div></div>';
    return;
  }

  // Registration counts come with each exam from the API
  const counts = {};
  exams.forEach(e => { counts[e.id] = e.registered; });

  $('examsList').innerHTML = '<div class="card"><table><thead><tr><th>Exam</th><th>Course</th><th>Date</th><th>Seats</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
    exams.map(e => `<tr>
      <td><strong style="color:var(--text)">${esc(e.title)}</strong>${e.description ? '<br><span style="font-size:.78rem;color:var(--text3)">' + esc(e.description.substring(0, 60)) + '</span>' : ''}</td>
      <td><span class="badge ${courseBadge[e.course_type] || 'badge-gray'}">${esc(courseLabels[e.course_type] || e.course_type)}</span></td>
      <td>${fmtDateTime(e.exam_date)}<br><span style="font-size:.75rem;color:var(--text3)">${esc(e.duration_minutes)} min</span></td>
      <td>${esc(counts[e.id] || 0)} / ${esc(e.max_seats)}</td>
      <td><span class="badge ${statusBadge[e.status] || 'badge-gray'}">${esc(e.status)}</span></td>
      <td><button class="btn btn-sm btn-secondary" onclick="viewExamRegs(${e.id})">👥 Regs</button> <button class="btn btn-sm btn-secondary" onclick="openExamModal(${e.id})">✏️</button>${session.role === 'owner' ? ` <button class="btn btn-sm btn-danger" onclick="deleteExam(${e.id})">🗑</button>` : ''}</td>
    </tr>`).join('') + '</tbody></table></div>';
}

function openExamModal(editId) {
  const isEdit = typeof editId === 'number';
  const title = isEdit ? 'Edit Mock Exam' : 'New Mock Exam';

  openModal(`
    <div class="modal-title">${title}<button class="modal-close" onclick="closeModal()">✕</button></div>
    <div id="examFormBody">Loading...</div>
  `);

  if (isEdit) {
    api('GET', 'admin/exams/' + editId + '/').then(({ data: e, error }) => {
      if (error) { showApiError(error); closeModal(); return; }
      // Build the date from LOCAL date parts. toISOString() is UTC, so exams between
      // 00:00 and 04:59 Tashkent time used to show the previous day.
      const dt = new Date(e.exam_date);
      const pad = n => String(n).padStart(2, '0');
      const dateVal = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      const timeVal = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      fillExamForm(e.title, e.description || '', e.course_type, dateVal, timeVal, e.duration_minutes, e.max_seats, e.status, editId, e.price_uzs, e.location || '');
    });
  } else {
    fillExamForm('', '', 'ielts', '', '', 120, 30, 'upcoming', null, 150000, 'Stanford Main Center, Nukus');
  }
}

function fillExamForm(title, desc, course, date, time, dur, seats, status, editId, price, location) {
  $('examFormBody').innerHTML = `
    <div class="form-group"><label>Title</label><input class="form-control" id="exTitle" value="${esc(title)}" placeholder="e.g. IELTS Mock Test #5"/></div>
    <div class="form-group"><label>Description</label><textarea class="form-control" id="exDesc" placeholder="Optional details...">${esc(desc)}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Course Type</label><select class="form-control" id="exCourse"><option value="ielts" ${course==='ielts'?'selected':''}>IELTS Preparation</option><option value="general" ${course==='general'?'selected':''}>General English</option><option value="advanced" ${course==='advanced'?'selected':''}>Advanced English</option><option value="kids" ${course==='kids'?'selected':''}>Kids English</option></select></div>
      <div class="form-group"><label>Status</label><select class="form-control" id="exStatus"><option value="upcoming" ${status==='upcoming'?'selected':''}>Upcoming</option><option value="in_progress" ${status==='in_progress'?'selected':''}>In Progress</option><option value="completed" ${status==='completed'?'selected':''}>Completed</option><option value="cancelled" ${status==='cancelled'?'selected':''}>Cancelled</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Date</label><input class="form-control" id="exDate" type="date" value="${esc(date)}"/></div>
      <div class="form-group"><label>Time</label><input class="form-control" id="exTime" type="time" value="${esc(time)}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Duration (minutes)</label><input class="form-control" id="exDur" type="number" value="${esc(dur)}"/></div>
      <div class="form-group"><label>Max Seats</label><input class="form-control" id="exSeats" type="number" value="${esc(seats)}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Price (UZS)</label><input class="form-control" id="exPrice" type="number" min="0" step="1000" value="${esc(price ?? '')}" placeholder="e.g. 150000"/></div>
      <div class="form-group"><label>Location</label><input class="form-control" id="exLocation" value="${esc(location || '')}" placeholder="e.g. Stanford Main Center, Nukus"/></div>
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="saveExamBtn">${editId ? 'Save Changes' : 'Create Exam'}</button></div>
  `;
  $('saveExamBtn').addEventListener('click', () => saveExam(editId));
}

async function saveExam(editId) {
  const title = $('exTitle').value.trim();
  const desc = $('exDesc').value.trim();
  const course = $('exCourse').value;
  const status = $('exStatus').value;
  const date = $('exDate').value;
  const time = $('exTime').value;
  const dur = parseInt($('exDur').value) || 120;
  const seats = parseInt($('exSeats').value) || 30;
  const priceText = $('exPrice').value.trim();
  const price = parseInt(priceText, 10);
  const location = $('exLocation').value.trim();

  if (!title || !date || !time) { alert('Title, date, and time are required'); return; }
  if (priceText === '' || isNaN(price) || price < 0) { alert('Price (UZS) is required and cannot be negative'); return; }
  if (!location) { alert('Location is required'); return; }

  const examDate = new Date(date + 'T' + time).toISOString();
  const row = { title, description: desc || null, course_type: course, exam_date: examDate, duration_minutes: dur, max_seats: seats, status, price_uzs: price, location };

  const { error } = editId
    ? await api('PATCH', 'admin/exams/' + editId + '/', row)
    : await api('POST', 'admin/exams/', row);
  if (error) { showApiError(error); return; }
  toast(editId ? 'Exam updated' : 'Exam created');
  closeModal();
  renderExams();
}

async function deleteExam(id) {
  if (!confirm('Delete this exam and all its registrations?')) return;
  const { error } = await api('DELETE', 'admin/exams/' + id + '/');
  if (error) { showApiError(error); return; }
  toast('Exam deleted');
  renderExams();
}

async function viewExamRegs(examId) {
  const [{ data: exam }, { data: regs, error }] = await Promise.all([
    api('GET', 'admin/exams/' + examId + '/'),
    api('GET', 'admin/exams/' + examId + '/registrations/')
  ]);
  if (error) { showApiError(error); return; }
  const regsList = regs || [];
  const genderLabels = { male: 'М', female: 'Ж' };
  const scoreInput = (r, band) => `<input class="score-input" inputmode="decimal" data-reg="${r.id}" data-band="${band}" value="${r[band] === null || r[band] === undefined ? '' : Number(r[band]).toFixed(1)}" placeholder="—" aria-label="${band}"/>`;

  openModal(`
    <div class="modal-title">${esc(exam?.title || 'Exam')} — записи (${regsList.length})<button class="modal-close" onclick="closeModal()" aria-label="Закрыть">✕</button></div>
    ${regsList.length ? `<p class="hint" style="margin:-8px 0 16px">Баллы L / R / W / S: от 0 до 9 с шагом 0.5. Overall считается автоматически. Студент увидит результат на сайте по номеру билета и телефону.</p>
    <div class="table-wrap"><table><thead><tr><th>Билет</th><th>Кандидат</th><th>Телефон</th><th>Пол</th><th>Оплата</th><th>Был?</th><th>L</th><th>R</th><th>W</th><th>S</th><th>Overall</th><th></th></tr></thead><tbody>` +
      regsList.map(r => `
        <tr data-row="${r.id}">
          <td><code style="background:var(--bg3);padding:3px 7px;border-radius:6px;font-size:.78rem;white-space:nowrap">${esc(r.ticket_no || '—')}</code></td>
          <td style="color:var(--text);font-weight:600">${esc(r.full_name || ((r.first_name || '') + ' ' + (r.last_name || '')))}</td>
          <td><a href="tel:${esc(r.phone)}" style="font-weight:500;white-space:nowrap">${esc(r.phone)}</a></td>
          <td>${esc(genderLabels[r.gender] || '—')}</td>
          <td style="white-space:nowrap">
            <span class="badge badge-${r.payment_status === 'verified' ? 'green' : 'gold'}">${r.payment_status === 'verified' ? 'Оплачено' : 'Ожидает'}</span>
            <span class="muted" style="font-size:.75rem">${esc((r.payment_method || '').toUpperCase())}</span><br>
            ${r.payment_status !== 'verified'
              ? `<button class="btn btn-sm btn-primary" style="margin-top:6px" onclick="togglePayStatus(${r.id}, 'verified', ${examId})">Подтвердить оплату</button>`
              : `<button class="btn btn-sm btn-secondary" style="margin-top:6px" onclick="togglePayStatus(${r.id}, 'pending', ${examId})">Сбросить</button>`}
          </td>
          <td>
            <select class="form-control" style="height:34px;width:auto;font-size:.8rem;padding:0 8px" data-attended="${r.id}">
              <option value="" ${r.attended === null || r.attended === undefined ? 'selected' : ''}>—</option>
              <option value="true" ${r.attended === true ? 'selected' : ''}>Да</option>
              <option value="false" ${r.attended === false ? 'selected' : ''}>Нет</option>
            </select>
          </td>
          <td>${scoreInput(r, 'listening')}</td>
          <td>${scoreInput(r, 'reading')}</td>
          <td>${scoreInput(r, 'writing')}</td>
          <td>${scoreInput(r, 'speaking')}</td>
          <td><span class="overall-pill" data-overall="${r.id}">${bandText(r.overall)}</span></td>
          <td><button class="btn btn-sm btn-dark" onclick="saveRegScores(${r.id}, ${examId})">Сохранить</button></td>
        </tr>`).join('') +
      '</tbody></table></div>' : '<div class="empty-state"><div class="icon">👥</div><h3>Записей пока нет</h3><p>Студенты записываются на сайте, на странице mock.html</p></div>'}
  `, true);

  // Live Overall preview while typing the four bands
  modalContent.querySelectorAll('.score-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const id = inp.dataset.reg;
      const vals = ['listening', 'reading', 'writing', 'speaking'].map(b => modalContent.querySelector(`.score-input[data-reg="${id}"][data-band="${b}"]`).value.trim().replace(',', '.'));
      inp.classList.toggle('bad', inp.value.trim() !== '' && !isBand(inp.value.trim().replace(',', '.')));
      const o = ieltsOverall(vals);
      modalContent.querySelector(`[data-overall="${id}"]`).textContent = o ?? '—';
    });
  });
}

window.saveRegScores = async function(regId, examId) {
  const body = {};
  for (const band of ['listening', 'reading', 'writing', 'speaking']) {
    const raw = modalContent.querySelector(`.score-input[data-reg="${regId}"][data-band="${band}"]`).value.trim().replace(',', '.');
    if (raw !== '' && !isBand(raw)) { toast(`${band}: от 0 до 9 с шагом 0.5`, 'error'); return; }
    body[band] = raw === '' ? null : raw;
  }
  const att = modalContent.querySelector(`[data-attended="${regId}"]`).value;
  body.attended = att === '' ? null : att === 'true';
  const { data, error } = await api('PATCH', 'admin/exam-registrations/' + regId + '/', body);
  if (error) { showApiError(error); return; }
  modalContent.querySelector(`[data-overall="${regId}"]`).textContent = bandText(data.overall);
  toast(data.overall !== null ? `Сохранено. Overall ${bandText(data.overall)}` : 'Сохранено');
};

window.togglePayStatus = async function(regId, newStatus, examId) {
  const { error } = await api('PATCH', 'admin/exam-registrations/' + regId + '/', { payment_status: newStatus });
  if (error) { showApiError(error); return; }
  toast('Статус оплаты обновлён');
  if (examId) viewExamRegs(examId);
};

// ════════════════════════════════════════════
// STUDENTS (Trial Registrations)
// ════════════════════════════════════════════
async function renderStudents() {
  mainContent.innerHTML = `
    <div class="page-header"><h1>Заявки</h1><p>Заявки с сайта: кнопка «Записаться» на карточке курса и форма «Оставить заявку». Заметка видна только сотрудникам.</p></div>
    <div class="filter-bar">
      <select id="studFilter"><option value="">All statuses</option><option value="new">🆕 New</option><option value="contacted">📞 Contacted</option><option value="enrolled">✅ Enrolled</option><option value="declined">❌ Declined</option></select>
      <select id="studCourseFilter"><option value="">All courses</option><option value="ielts">IELTS</option><option value="general">General</option><option value="advanced">Advanced</option><option value="kids">Kids</option><option value="unsure">Не знает</option></select>
    </div>
    <div id="studentsList">Loading...</div>
  `;
  $('studFilter').addEventListener('change', loadStudents);
  $('studCourseFilter').addEventListener('change', loadStudents);
  await loadStudents();
}

async function loadStudents() {
  const sf = $('studFilter')?.value || '';
  const cf = $('studCourseFilter')?.value || '';
  const params = new URLSearchParams();
  if (sf) params.set('status', sf);
  if (cf) params.set('course', cf);
  const { data, error } = await api('GET', 'admin/students/?' + params.toString());
  if (error) { $('studentsList').textContent = error.detail || 'Could not load students'; return; }
  const students = data || [];

  if (!students.length) {
    $('studentsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">👥</div><h3>No registrations found</h3><p>Registrations from the public site will appear here</p></div></div>';
    return;
  }

  $('studentsList').innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr><th>Имя</th><th>Телефон</th><th>Курс</th><th>Откуда</th><th>Время</th><th>Комментарий</th><th>Статус</th><th>Заметка сотрудника</th><th>Дата</th></tr></thead><tbody>' +
    students.map(s => `<tr>
      <td style="color:var(--text);font-weight:600">${esc(s.full_name)}</td>
      <td><a href="tel:${esc(s.phone)}" style="white-space:nowrap;font-weight:500">${esc(s.phone)}</a></td>
      <td><span class="badge ${courseBadge[s.course] || 'badge-gray'}">${esc(courseLabels[s.course] || s.course)}</span></td>
      <td style="font-size:.82rem">${esc(sourceLabels[s.source] || '—')}</td>
      <td style="font-size:.82rem">${esc(timeLabels[s.preferred_time] || '—')}</td>
      <td class="comment-cell">${s.comment ? esc(s.comment) : '<span class="muted">—</span>'}</td>
      <td>
        <select class="form-control" style="width:auto;height:34px;padding:0 8px;font-size:.8rem" onchange="updateStudentStatus(${s.id}, this.value)">
          <option value="new" ${s.status==='new'?'selected':''}>🆕 Новая</option>
          <option value="contacted" ${s.status==='contacted'?'selected':''}>📞 Связались</option>
          <option value="enrolled" ${s.status==='enrolled'?'selected':''}>✅ Записан</option>
          <option value="declined" ${s.status==='declined'?'selected':''}>❌ Отказ</option>
        </select>
      </td>
      <td><textarea class="note-input" rows="1" placeholder="Заметка…" data-note="${s.id}">${esc(s.staff_note || '')}</textarea></td>
      <td style="white-space:nowrap">${fmtDate(s.created_at)}</td>
    </tr>`).join('') + '</tbody></table></div></div>';

  // Staff note is saved when the field loses focus (only if it changed)
  $('studentsList').querySelectorAll('[data-note]').forEach(el => {
    let saved = el.value;
    el.addEventListener('blur', async () => {
      if (el.value === saved) return;
      const { error } = await api('PATCH', 'admin/students/' + el.dataset.note + '/', { staff_note: el.value.trim() });
      if (error) { showApiError(error); return; }
      saved = el.value;
      toast('Заметка сохранена');
    });
  });
}

async function updateStudentStatus(id, status) {
  const { error } = await api('PATCH', 'admin/students/' + id + '/', { status });
  if (error) { showApiError(error); loadStudents(); return; } // reload so the dropdown shows the saved value
  toast('Статус обновлён');
  loadStudents();
}

// ════════════════════════════════════════════
// NEWS
// ════════════════════════════════════════════
async function renderNews() {
  mainContent.innerHTML = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>News</h1><p>Manage news posts for the centre</p></div><button class="btn btn-primary" id="addNewsBtn">+ New Post</button></div><div id="newsList">Loading...</div>';
  $('addNewsBtn').addEventListener('click', () => openNewsModal());
  await loadNews();
}

async function loadNews() {
  const { data, error } = await api('GET', 'admin/news/');
  if (error) { $('newsList').textContent = error.detail || 'Could not load news'; return; }
  const news = data || [];

  if (!news.length) {
    $('newsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">📰</div><h3>No news posts</h3><p>Publish your first news post</p></div></div>';
    return;
  }

  $('newsList').innerHTML = news.map(n => `
    <div class="card">
      <div class="card-title"><span>${esc(n.title)}</span><span style="font-size:.75rem;color:var(--text3);font-family:Inter,sans-serif;font-weight:400">${fmtDate(n.created_at)}</span></div>
      <p style="font-size:.88rem;color:var(--text2);line-height:1.65;margin-bottom:16px">${esc(n.body || '')}</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-secondary" onclick="openNewsModal(${n.id})">✏️ Edit</button>
        ${session.role === 'owner' ? `<button class="btn btn-sm btn-danger" onclick="deleteNews(${n.id})">🗑 Delete</button>` : ''}
      </div>
    </div>
  `).join('');
}

function openNewsModal(editId) {
  const isEdit = typeof editId === 'number';
  openModal(`<div class="modal-title">${isEdit ? 'Edit Post' : 'New Post'}<button class="modal-close" onclick="closeModal()">✕</button></div><div id="newsFormBody">Loading...</div>`);

  if (isEdit) {
    api('GET', 'admin/news/' + editId + '/').then(({ data: n, error }) => {
      if (error) { showApiError(error); closeModal(); return; }
      fillNewsForm(n.title, n.body || '', editId);
    });
  } else {
    fillNewsForm('', '', null);
  }
}

function fillNewsForm(title, body, editId) {
  $('newsFormBody').innerHTML = `
    <div class="form-group"><label>Title</label><input class="form-control" id="newsTitle" value="${esc(title)}" placeholder="e.g. Autumn IELTS intake open"/></div>
    <div class="form-group"><label>Body</label><textarea class="form-control" id="newsBody" rows="4" placeholder="Post details...">${esc(body)}</textarea></div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="saveNewsBtn">${editId ? 'Save Changes' : 'Publish'}</button></div>
  `;
  $('saveNewsBtn').addEventListener('click', () => saveNews(editId));
}

async function saveNews(editId) {
  const title = $('newsTitle').value.trim();
  const body = $('newsBody').value.trim();
  if (!title) { alert('Title is required'); return; }

  const { error } = editId
    ? await api('PATCH', 'admin/news/' + editId + '/', { title, body })
    : await api('POST', 'admin/news/', { title, body });
  if (error) { showApiError(error); return; }
  toast(editId ? 'Post updated' : 'Post published');
  closeModal();
  renderNews();
}

async function deleteNews(id) {
  if (!confirm('Delete this news post?')) return;
  const { error } = await api('DELETE', 'admin/news/' + id + '/');
  if (error) { showApiError(error); return; }
  toast('Post deleted');
  renderNews();
}


// ════════════════════════════════════════════
// GALLERY («Жизнь центра изнутри» on the main site)
// ════════════════════════════════════════════
const sizeLabels = { normal: 'Обычное (1×1)', tall: 'Высокое (1×2)', wide: 'Широкое (2×1)' };

// Upload a file with FormData (multipart). The api() helper only sends JSON.
async function apiUpload(method, path, formData) {
  try {
    const res = await fetch('/api/' + path, {
      method, credentials: 'same-origin',
      headers: { 'X-CSRFToken': getCookie('csrftoken') || '' },
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { data } : { error: { status: res.status, ...data } };
  } catch (e) {
    return { error: { detail: 'Network error — check your connection.' } };
  }
}

// Shrink big phone photos in the browser before uploading (faster, and
// Vercel accepts at most ~4.5 MB per request). The server compresses again.
async function shrinkImage(file, maxSide = 2000, quality = 0.88) {
  let bitmap = null;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { return file; }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 3.5 * 1024 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob ? new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
}

let galleryPhotos = [];

async function renderGallery() {
  mainContent.innerHTML = `
    <div class="page-header"><h1>Галерея</h1><p>Фото для раздела «Галерея» на главной странице. Пока здесь нет фото, раздел на сайте скрыт.</p></div>
    <div class="card">
      <div class="card-title">Добавить фото</div>
      <div class="upload-zone" id="uploadZone">📷 Нажмите или перетащите сюда фото (можно несколько)<br><span style="font-size:.78rem;color:var(--text3)">JPG, PNG или WEBP · большие фото уменьшаются автоматически</span></div>
      <input type="file" id="galleryFile" accept="image/jpeg,image/png,image/webp" multiple style="display:none"/>
      <div class="form-row" style="margin-top:14px">
        <div class="form-group"><label>Подпись (необязательно)</label><input class="form-control" id="galleryCaption" placeholder="например: Урок для детей"/></div>
        <div class="form-group"><label>Размер на сайте</label><select class="form-control" id="gallerySize">${Object.entries(sizeLabels).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      </div>
      <div id="uploadStatus" style="font-size:.84rem;color:var(--text2)"></div>
    </div>
    <div id="galleryList">Loading...</div>
  `;

  const zone = $('uploadZone');
  const input = $('galleryFile');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); uploadPhotos(e.dataTransfer.files); });
  input.addEventListener('change', () => { uploadPhotos(input.files); input.value = ''; });

  await loadGallery();
}

async function uploadPhotos(fileList) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  const status = $('uploadStatus');
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    status.textContent = `Загрузка ${i + 1} из ${files.length}...`;
    const fd = new FormData();
    fd.append('image', await shrinkImage(files[i]));
    fd.append('caption', $('galleryCaption').value.trim());
    fd.append('size', $('gallerySize').value);
    const { error } = await apiUpload('POST', 'admin/gallery/', fd);
    if (error) { status.textContent = ''; showApiError(error); break; }
    ok++;
  }
  status.textContent = '';
  if (ok) { toast(ok === 1 ? 'Фото добавлено' : `Добавлено фото: ${ok}`); $('galleryCaption').value = ''; }
  loadGallery();
}

async function loadGallery() {
  const { data, error } = await api('GET', 'admin/gallery/');
  if (error) { $('galleryList').textContent = error.detail || 'Could not load photos'; return; }
  galleryPhotos = data || [];

  if (!galleryPhotos.length) {
    $('galleryList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">🖼️</div><h3>Фото пока нет</h3><p>Раздел «Галерея» на сайте скрыт, пока здесь нет ни одного фото</p></div></div>';
    return;
  }

  $('galleryList').innerHTML = '<div class="gallery-admin-grid">' + galleryPhotos.map((p, i) => `
    <div class="gallery-admin-card">
      <img src="${esc(p.url)}" alt="${esc(p.caption || '')}" loading="lazy"/>
      <div class="gallery-admin-body">
        <span class="gallery-pos">#${i + 1} на сайте · ${esc(p.width)}×${esc(p.height)}</span>
        <input class="form-control" value="${esc(p.caption || '')}" placeholder="Подпись" onchange="updatePhoto(${p.id}, { caption: this.value.trim() })"/>
        <select class="form-control" onchange="updatePhoto(${p.id}, { size: this.value })">
          ${Object.entries(sizeLabels).map(([v, l]) => `<option value="${v}" ${p.size === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <div class="gallery-admin-actions">
          <button class="btn btn-sm btn-secondary" title="Раньше" onclick="movePhoto(${p.id}, -1)" ${i === 0 ? 'disabled' : ''}>←</button>
          <button class="btn btn-sm btn-secondary" title="Позже" onclick="movePhoto(${p.id}, 1)" ${i === galleryPhotos.length - 1 ? 'disabled' : ''}>→</button>
          <button class="btn btn-sm btn-secondary" onclick="replacePhoto(${p.id})">🔄 Заменить</button>
          ${session.role === 'owner' ? `<button class="btn btn-sm btn-danger" onclick="deletePhoto(${p.id})">🗑</button>` : ''}
        </div>
      </div>
    </div>`).join('') + '</div>';
}

async function updatePhoto(id, changes) {
  const { error } = await api('PATCH', 'admin/gallery/' + id + '/', changes);
  if (error) { showApiError(error); return; }
  toast('Сохранено');
}

async function movePhoto(id, direction) {
  const ids = galleryPhotos.map(p => p.id);
  const i = ids.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const { error } = await api('POST', 'admin/gallery/reorder/', { ids });
  if (error) { showApiError(error); return; }
  loadGallery();
}

function replacePhoto(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.addEventListener('change', async () => {
    if (!input.files.length) return;
    const fd = new FormData();
    fd.append('image', await shrinkImage(input.files[0]));
    const { error } = await apiUpload('PATCH', 'admin/gallery/' + id + '/', fd);
    if (error) { showApiError(error); return; }
    toast('Фото заменено');
    loadGallery();
  });
  input.click();
}

async function deletePhoto(id) {
  if (!confirm('Удалить это фото с сайта?')) return;
  const { error } = await api('DELETE', 'admin/gallery/' + id + '/');
  if (error) { showApiError(error); return; }
  toast('Фото удалено');
  loadGallery();
}

// ════════════════════════════════════════════
// RESULTS («Результаты» marquee on the main site)
// ════════════════════════════════════════════
let resultsRows = [];

async function renderResults() {
  mainContent.innerHTML = `
    <div class="page-header page-header-row" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
      <div><h1>Результаты</h1><p>Настоящие результаты IELTS студентов. На сайте показываются только опубликованные, в этом порядке. Если опубликованных нет — раздел «Результаты» на сайте скрыт.</p></div>
      <button class="btn btn-primary" id="addResultBtn">+ Добавить результат</button>
    </div>
    <div id="resultsList">Загрузка…</div>`;
  $('addResultBtn').addEventListener('click', () => openResultModal());
  await loadResults();
}

async function loadResults() {
  const { data, error } = await api('GET', 'admin/results/');
  if (error) { $('resultsList').textContent = errorMessage(error); return; }
  resultsRows = data || [];
  if (!resultsRows.length) {
    $('resultsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">🏆</div><h3>Результатов пока нет</h3><p>Добавьте первый результат с фото сертификата</p></div></div>';
    return;
  }
  $('resultsList').innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr><th>Фото</th><th>Студент</th><th>L / R / W / S</th><th>Overall</th><th>Курс</th><th>Дата экзамена</th><th>На сайте</th><th>Порядок</th><th></th></tr></thead><tbody>' +
    resultsRows.map((r, i) => `<tr>
      <td>${r.image_url ? `<img class="thumb" src="${esc(r.image_url)}" alt="" loading="lazy"/>` : '<span class="thumb" aria-hidden="true"></span>'}</td>
      <td style="color:var(--text);font-weight:600">${esc(r.first_name)} ${r.last_name_initial ? esc(r.last_name_initial) + '.' : ''}</td>
      <td class="bands">${[r.listening, r.reading, r.writing, r.speaking].map(bandText).join(' / ')}</td>
      <td><span class="overall-pill">${bandText(r.overall)}</span></td>
      <td><span class="badge ${courseBadge[r.course] || 'badge-gray'}">${esc(courseLabels[r.course] || r.course)}</span></td>
      <td style="white-space:nowrap">${r.exam_date ? fmtDate(r.exam_date) : '—'}</td>
      <td><label class="switch"><input type="checkbox" ${r.is_published ? 'checked' : ''} onchange="togglePublished('results', ${r.id}, this.checked)"/></label></td>
      <td><span class="order-btns">
        <button class="btn btn-sm btn-secondary" title="Выше" aria-label="Выше" onclick="moveRow('results', ${r.id}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn btn-sm btn-secondary" title="Ниже" aria-label="Ниже" onclick="moveRow('results', ${r.id}, 1)" ${i === resultsRows.length - 1 ? 'disabled' : ''}>↓</button>
      </span></td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-secondary" onclick="openResultModal(${r.id})">✏️ Изменить</button>${session.role === 'owner' ? ` <button class="btn btn-sm btn-danger" onclick="deleteRow('results', ${r.id})" aria-label="Удалить">🗑</button>` : ''}</td>
    </tr>`).join('') + '</tbody></table></div></div>';
}

function bandSelect(id, value, allowEmpty) {
  const v = (value === null || value === undefined || value === '') ? '' : Number(value).toFixed(1);
  return `<select class="form-control" id="${id}">${allowEmpty ? `<option value="" ${v === '' ? 'selected' : ''}>—</option>` : (v === '' ? '<option value="" selected disabled>—</option>' : '')}${BAND_VALUES.slice().reverse().map(b => `<option value="${b}" ${b === v ? 'selected' : ''}>${b}</option>`).join('')}</select>`;
}

// Photo picker shared by the result and teacher forms
let pickedPhoto = null;   // File chosen in the form (null = keep the current one)
let removePhoto = false;
function photoPickerHtml(currentUrl, square) {
  return `
    <div class="form-group"><label>${square ? 'Фото преподавателя' : 'Фото сертификата (необязательно)'}</label>
      <div class="photo-pick">
        <img class="photo-preview ${square ? 'square' : ''}" id="photoPreview" src="${currentUrl ? esc(currentUrl) : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='}" alt=""/>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
          <button type="button" class="btn btn-sm btn-secondary" id="photoPickBtn">📷 Выбрать фото</button>
          <button type="button" class="btn btn-sm btn-secondary" id="photoRemoveBtn" ${currentUrl ? '' : 'style="display:none"'}>Убрать фото</button>
          <span class="hint">${square ? 'Лучше квадратное или вертикальное фото, лицо по центру.' : 'Вертикальное фото 9:16. Без фото карточка будет жёлтой.'}</span>
        </div>
      </div>
      <input type="file" id="photoFile" accept="image/jpeg,image/png,image/webp" style="display:none"/>
    </div>`;
}
function wirePhotoPicker() {
  pickedPhoto = null; removePhoto = false;
  const input = $('photoFile');
  $('photoPickBtn').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if (!input.files.length) return;
    pickedPhoto = input.files[0]; removePhoto = false;
    $('photoPreview').src = URL.createObjectURL(pickedPhoto);
    $('photoRemoveBtn').style.display = '';
  });
  $('photoRemoveBtn').addEventListener('click', () => {
    pickedPhoto = null; removePhoto = true; input.value = '';
    $('photoPreview').src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    $('photoRemoveBtn').style.display = 'none';
  });
}
async function appendPhoto(fd) {
  if (pickedPhoto) fd.append('image', await shrinkImage(pickedPhoto));
  else if (removePhoto) fd.append('remove_image', '1');
}

function openResultModal(editId) {
  const r = resultsRows.find(x => x.id === editId) || { first_name: '', last_name_initial: '', listening: null, reading: null, writing: null, speaking: null, course: 'ielts', exam_date: '', is_published: false, image_url: null };
  openModal(`
    <div class="modal-title">${editId ? 'Изменить результат' : 'Новый результат'}<button class="modal-close" onclick="closeModal()" aria-label="Закрыть">✕</button></div>
    <div class="form-row">
      <div class="form-group"><label for="rFirst">Имя</label><input class="form-control" id="rFirst" value="${esc(r.first_name)}" placeholder="Как в сертификате"/></div>
      <div class="form-group"><label for="rInitial">Первая буква фамилии</label><input class="form-control" id="rInitial" maxlength="2" value="${esc(r.last_name_initial)}" placeholder="например: К"/></div>
    </div>
    <div class="form-row-4">
      <div class="form-group"><label for="rL">Listening</label>${bandSelect('rL', r.listening)}</div>
      <div class="form-group"><label for="rR">Reading</label>${bandSelect('rR', r.reading)}</div>
      <div class="form-group"><label for="rW">Writing</label>${bandSelect('rW', r.writing)}</div>
      <div class="form-group"><label for="rS">Speaking</label>${bandSelect('rS', r.speaking)}</div>
    </div>
    <div class="overall-preview"><strong id="rOverall">—</strong><span>Overall считается автоматически по правилам IELTS</span></div>
    <div class="form-row">
      <div class="form-group"><label for="rCourse">Курс</label><select class="form-control" id="rCourse">${['ielts', 'general', 'advanced', 'kids'].map(c => `<option value="${c}" ${r.course === c ? 'selected' : ''}>${courseLabels[c]}</option>`).join('')}</select></div>
      <div class="form-group"><label for="rDate">Дата экзамена</label><input class="form-control" type="date" id="rDate" value="${esc(r.exam_date || '')}"/></div>
    </div>
    ${photoPickerHtml(r.image_url, false)}
    <label class="switch"><input type="checkbox" id="rPublished" ${r.is_published ? 'checked' : ''}/> Показывать на сайте</label>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Отмена</button><button class="btn btn-dark" id="saveResultBtn">${editId ? 'Сохранить' : 'Добавить'}</button></div>
  `);
  const updateOverall = () => { $('rOverall').textContent = ieltsOverall(['rL', 'rR', 'rW', 'rS'].map(id => $(id).value)) ?? '—'; };
  ['rL', 'rR', 'rW', 'rS'].forEach(id => $(id).addEventListener('change', updateOverall));
  updateOverall();
  wirePhotoPicker();
  $('saveResultBtn').addEventListener('click', () => saveResult(editId));
}

async function saveResult(editId) {
  const bands = { listening: $('rL').value, reading: $('rR').value, writing: $('rW').value, speaking: $('rS').value };
  if (!$('rFirst').value.trim()) { toast('Укажите имя', 'error'); return; }
  if (Object.values(bands).some(v => !isBand(v))) { toast('Выберите все 4 балла', 'error'); return; }
  const fd = new FormData();
  fd.append('first_name', $('rFirst').value.trim());
  fd.append('last_name_initial', $('rInitial').value.trim());
  Object.entries(bands).forEach(([k, v]) => fd.append(k, v));
  fd.append('course', $('rCourse').value);
  fd.append('exam_date', $('rDate').value);
  fd.append('is_published', $('rPublished').checked ? 'true' : 'false');
  $('saveResultBtn').disabled = true;
  await appendPhoto(fd);
  const { error } = editId ? await apiUpload('PATCH', 'admin/results/' + editId + '/', fd) : await apiUpload('POST', 'admin/results/', fd);
  if ($('saveResultBtn')) $('saveResultBtn').disabled = false;
  if (error) { showApiError(error); return; }
  toast(editId ? 'Результат сохранён' : 'Результат добавлен');
  closeModal();
  loadResults();
}

// ════════════════════════════════════════════
// TEACHERS («Преподаватели» on the main site)
// ════════════════════════════════════════════
let teacherRows = [];

async function renderTeachers() {
  mainContent.innerHTML = `
    <div class="page-header page-header-row" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
      <div><h1>Преподаватели</h1><p>На сайте показываются только опубликованные преподаватели, в этом порядке. Если опубликованных нет — раздел на сайте скрыт.</p></div>
      <button class="btn btn-primary" id="addTeacherBtn">+ Добавить преподавателя</button>
    </div>
    <div id="teachersList">Загрузка…</div>`;
  $('addTeacherBtn').addEventListener('click', () => openTeacherModal());
  await loadTeachers();
}

async function loadTeachers() {
  const { data, error } = await api('GET', 'admin/teachers/');
  if (error) { $('teachersList').textContent = errorMessage(error); return; }
  teacherRows = data || [];
  if (!teacherRows.length) {
    $('teachersList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">🎓</div><h3>Преподавателей пока нет</h3><p>Добавьте преподавателя с настоящим фото</p></div></div>';
    return;
  }
  $('teachersList').innerHTML = '<div class="card"><div class="table-wrap"><table><thead><tr><th>Фото</th><th>Имя</th><th>Специализация</th><th>IELTS</th><th>Опыт</th><th>Теги</th><th>На сайте</th><th>Порядок</th><th></th></tr></thead><tbody>' +
    teacherRows.map((t, i) => `<tr>
      <td>${t.image_url ? `<img class="thumb round" src="${esc(t.image_url)}" alt="" loading="lazy"/>` : '<span class="thumb round" aria-hidden="true"></span>'}</td>
      <td style="color:var(--text);font-weight:600">${esc(t.name)}</td>
      <td style="font-size:.84rem">${esc(t.role || '—')}</td>
      <td>${t.ielts_band !== null && t.ielts_band !== undefined ? `<span class="overall-pill">${bandText(t.ielts_band)}</span>` : '—'}</td>
      <td style="white-space:nowrap">${t.experience_years !== null && t.experience_years !== undefined ? esc(t.experience_years) + ' лет' : '—'}</td>
      <td style="font-size:.8rem">${esc(t.tags || '—')}</td>
      <td><label class="switch"><input type="checkbox" ${t.is_published ? 'checked' : ''} onchange="togglePublished('teachers', ${t.id}, this.checked)"/></label></td>
      <td><span class="order-btns">
        <button class="btn btn-sm btn-secondary" title="Выше" aria-label="Выше" onclick="moveRow('teachers', ${t.id}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn btn-sm btn-secondary" title="Ниже" aria-label="Ниже" onclick="moveRow('teachers', ${t.id}, 1)" ${i === teacherRows.length - 1 ? 'disabled' : ''}>↓</button>
      </span></td>
      <td style="white-space:nowrap"><button class="btn btn-sm btn-secondary" onclick="openTeacherModal(${t.id})">✏️ Изменить</button>${session.role === 'owner' ? ` <button class="btn btn-sm btn-danger" onclick="deleteRow('teachers', ${t.id})" aria-label="Удалить">🗑</button>` : ''}</td>
    </tr>`).join('') + '</tbody></table></div></div>';
}

function openTeacherModal(editId) {
  const t = teacherRows.find(x => x.id === editId) || { name: '', role: '', ielts_band: null, experience_years: null, tags: '', is_published: false, image_url: null };
  openModal(`
    <div class="modal-title">${editId ? 'Изменить преподавателя' : 'Новый преподаватель'}<button class="modal-close" onclick="closeModal()" aria-label="Закрыть">✕</button></div>
    <div class="form-group"><label for="tName">Имя и фамилия</label><input class="form-control" id="tName" value="${esc(t.name)}"/></div>
    <div class="form-group"><label for="tRole">Специализация</label><input class="form-control" id="tRole" value="${esc(t.role)}" placeholder="например: IELTS, Speaking"/></div>
    <div class="form-row">
      <div class="form-group"><label for="tBand">Балл IELTS (если есть)</label>${bandSelect('tBand', t.ielts_band, true)}</div>
      <div class="form-group"><label for="tYears">Опыт, лет</label><input class="form-control" type="number" min="0" max="60" id="tYears" value="${t.experience_years ?? ''}"/></div>
    </div>
    <div class="form-group"><label for="tTags">Теги</label><input class="form-control" id="tTags" value="${esc(t.tags)}" placeholder="через запятую: IELTS, Kids, Grammar"/></div>
    ${photoPickerHtml(t.image_url, true)}
    <label class="switch"><input type="checkbox" id="tPublished" ${t.is_published ? 'checked' : ''}/> Показывать на сайте</label>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Отмена</button><button class="btn btn-dark" id="saveTeacherBtn">${editId ? 'Сохранить' : 'Добавить'}</button></div>
  `);
  wirePhotoPicker();
  $('saveTeacherBtn').addEventListener('click', () => saveTeacher(editId));
}

async function saveTeacher(editId) {
  if (!$('tName').value.trim()) { toast('Укажите имя', 'error'); return; }
  const fd = new FormData();
  fd.append('name', $('tName').value.trim());
  fd.append('role', $('tRole').value.trim());
  fd.append('ielts_band', $('tBand').value);
  fd.append('experience_years', $('tYears').value.trim());
  fd.append('tags', $('tTags').value.trim());
  fd.append('is_published', $('tPublished').checked ? 'true' : 'false');
  $('saveTeacherBtn').disabled = true;
  await appendPhoto(fd);
  const { error } = editId ? await apiUpload('PATCH', 'admin/teachers/' + editId + '/', fd) : await apiUpload('POST', 'admin/teachers/', fd);
  if ($('saveTeacherBtn')) $('saveTeacherBtn').disabled = false;
  if (error) { showApiError(error); return; }
  toast(editId ? 'Сохранено' : 'Преподаватель добавлен');
  closeModal();
  loadTeachers();
}

// Shared by results and teachers
const rowPages = {
  results: { rows: () => resultsRows, reload: () => loadResults() },
  teachers: { rows: () => teacherRows, reload: () => loadTeachers() },
};

async function togglePublished(kind, id, published) {
  const { error } = await api('PATCH', `admin/${kind}/${id}/`, { is_published: published });
  if (error) { showApiError(error); rowPages[kind].reload(); return; }
  toast(published ? 'Показано на сайте' : 'Скрыто с сайта');
  rowPages[kind].reload();
}

async function moveRow(kind, id, direction) {
  const ids = rowPages[kind].rows().map(r => r.id);
  const i = ids.indexOf(id), j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const { error } = await api('POST', `admin/${kind}/reorder/`, { ids });
  if (error) { showApiError(error); return; }
  rowPages[kind].reload();
}

async function deleteRow(kind, id) {
  if (!confirm('Удалить навсегда?')) return;
  const { error } = await api('DELETE', `admin/${kind}/${id}/`);
  if (error) { showApiError(error); return; }
  toast('Удалено');
  rowPages[kind].reload();
}

// ── Expose globals for inline onclick handlers ──
window.openExamModal = openExamModal;
window.deleteExam = deleteExam;
window.viewExamRegs = viewExamRegs;
window.updateStudentStatus = updateStudentStatus;
window.openNewsModal = openNewsModal;
window.deleteNews = deleteNews;
window.closeModal = closeModal;
window.updatePhoto = updatePhoto;
window.movePhoto = movePhoto;
window.replacePhoto = replacePhoto;
window.deletePhoto = deletePhoto;
window.openResultModal = openResultModal;
window.openTeacherModal = openTeacherModal;
window.togglePublished = togglePublished;
window.moveRow = moveRow;
window.deleteRow = deleteRow;

// ── Init ──
// Check if already logged in (this call also gives us Django's CSRF cookie)
(async () => {
  const { data } = await api('GET', 'auth/me/');
  if (data && data.authenticated) {
    session = { email: data.email, role: data.role };
    showApp();
    return;
  }
  loginWrap.style.display = 'flex';
})();
