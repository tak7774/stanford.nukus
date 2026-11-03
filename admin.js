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
  const views = { dashboard: renderDashboard, exams: renderExams, students: renderStudents, news: renderNews, gallery: renderGallery };
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
function openModal(html) { modalContent.innerHTML = html; modalOverlay.classList.add('active'); }
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

const courseLabels = { ielts: 'IELTS Preparation', general: 'General English', advanced: 'Advanced English', kids: 'Kids English' };
const formatLabels = { paper: 'Paper', computer: 'Computer' };
const courseBadge = { ielts: 'badge-red', general: 'badge-blue', advanced: 'badge-purple', kids: 'badge-green' };
const statusBadge = { new: 'badge-gold', contacted: 'badge-blue', enrolled: 'badge-green', declined: 'badge-gray', upcoming: 'badge-blue', in_progress: 'badge-gold', completed: 'badge-green', cancelled: 'badge-gray' };

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
async function renderDashboard() {
  mainContent.innerHTML = '<div class="page-header"><h1>Dashboard</h1><p>Overview of your centre</p></div><div class="stats-grid" id="dashStats">Loading...</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" id="dashCards"></div>';

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
      const dt = new Date(e.exam_date);
      const dateVal = dt.toISOString().slice(0, 10);
      const timeVal = dt.toTimeString().slice(0, 5);
      fillExamForm(e.title, e.description || '', e.course_type, dateVal, timeVal, e.duration_minutes, e.max_seats, e.status, editId);
    });
  } else {
    fillExamForm('', '', 'ielts', '', '', 120, 30, 'upcoming', null);
  }
}

function fillExamForm(title, desc, course, date, time, dur, seats, status, editId) {
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

  if (!title || !date || !time) { alert('Title, date, and time are required'); return; }

  const examDate = new Date(date + 'T' + time).toISOString();
  const row = { title, description: desc || null, course_type: course, exam_date: examDate, duration_minutes: dur, max_seats: seats, status };

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

  openModal(`
    <div class="modal-title">${esc(exam?.title || 'Exam')} — Registrations (${regsList.length})<button class="modal-close" onclick="closeModal()">✕</button></div>
    ${regsList.length ? '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse;"><thead><tr style="text-align:left; border-bottom:1px solid var(--border)"><th>Ticket</th><th>Candidate Name</th><th>Phone</th><th>Format</th><th>Gender / DOB</th><th>Payment</th><th>Method</th><th>Action</th></tr></thead><tbody>' +
      regsList.map(r => `
        <tr style="border-bottom:1px solid var(--border)">
          <td><code style="background:var(--bg3); padding:2px 6px; border-radius:4px; font-size:0.78rem; white-space:nowrap;">${esc(r.ticket_no || '—')}</code></td>
          <td style="color:var(--text); font-weight:600; padding:10px 4px;">${esc(r.full_name || ((r.first_name || '') + ' ' + (r.last_name || '')))}</td>
          <td><a href="tel:${esc(r.phone)}" style="color:var(--gold); font-weight:500;">${esc(r.phone)}</a></td>
          <td style="font-size:0.84rem; color:var(--text2);">${esc(formatLabels[r.format] || r.format || '—')}</td>
          <td style="font-size:0.84rem; color:var(--text2);">${esc(r.gender || '-')} / ${r.birth_date ? esc(r.birth_date) : '-'}</td>
          <td>
            <span class="badge badge-${r.payment_status === 'verified' ? 'green' : 'gold'}">
              ${r.payment_status === 'verified' ? 'VERIFIED' : 'PENDING'}
            </span>
          </td>
          <td style="font-size:0.82rem; font-weight:600;">${esc((r.payment_method || 'Click').toUpperCase())}</td>
          <td>
            ${r.payment_status !== 'verified' ? `<button class="btn btn-sm btn-primary" onclick="togglePayStatus(${r.id}, 'verified', ${examId})">Подтвердить оплату</button>` : `<button class="btn btn-sm btn-secondary" onclick="togglePayStatus(${r.id}, 'pending', ${examId})">Сбросить</button>`}
          </td>
        </tr>
      `).join('') +
      '</tbody></table></div>' : '<div class="empty-state"><div class="icon">👥</div><h3>No registrations yet</h3><p>Students can register from the public site</p></div>'}
  `);
}

window.togglePayStatus = async function(regId, newStatus, examId) {
  const { error } = await api('PATCH', 'admin/exam-registrations/' + regId + '/', { payment_status: newStatus });
  if (error) { showApiError(error); return; }
  toast('Payment status updated');
  if (examId) viewExamRegs(examId);
};

// ════════════════════════════════════════════
// STUDENTS (Trial Registrations)
// ════════════════════════════════════════════
async function renderStudents() {
  mainContent.innerHTML = `
    <div class="page-header"><h1>Students</h1><p>Trial lesson registrations from the website</p></div>
    <div class="filter-bar">
      <select id="studFilter"><option value="">All statuses</option><option value="new">🆕 New</option><option value="contacted">📞 Contacted</option><option value="enrolled">✅ Enrolled</option><option value="declined">❌ Declined</option></select>
      <select id="studCourseFilter"><option value="">All courses</option><option value="ielts">IELTS</option><option value="general">General</option><option value="advanced">Advanced</option><option value="kids">Kids</option></select>
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

  $('studentsList').innerHTML = '<div class="card"><table><thead><tr><th>Name</th><th>Phone</th><th>Course</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>' +
    students.map(s => `<tr>
      <td style="color:var(--text);font-weight:500">${esc(s.full_name)}</td>
      <td><a href="tel:${esc(s.phone)}" style="color:var(--gold)">${esc(s.phone)}</a></td>
      <td><span class="badge ${courseBadge[s.course] || 'badge-gray'}">${esc(courseLabels[s.course] || s.course)}</span></td>
      <td><span class="badge ${statusBadge[s.status] || 'badge-gray'}">${esc(s.status)}</span></td>
      <td>${fmtDate(s.created_at)}</td>
      <td>
        <select class="form-control" style="width:auto;padding:5px 8px;font-size:.75rem" onchange="updateStudentStatus(${s.id}, this.value)">
          <option value="new" ${s.status==='new'?'selected':''}>🆕 New</option>
          <option value="contacted" ${s.status==='contacted'?'selected':''}>📞 Contacted</option>
          <option value="enrolled" ${s.status==='enrolled'?'selected':''}>✅ Enrolled</option>
          <option value="declined" ${s.status==='declined'?'selected':''}>❌ Declined</option>
        </select>
      </td>
    </tr>`).join('') + '</tbody></table></div>';
}

async function updateStudentStatus(id, status) {
  const { error } = await api('PATCH', 'admin/students/' + id + '/', { status });
  if (error) { showApiError(error); loadStudents(); return; } // reload so the dropdown shows the saved value
  toast('Status updated to ' + status);
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
    <div class="page-header"><h1>Gallery</h1><p>Фото для раздела «Жизнь центра изнутри» на главной странице. Пока здесь нет фото, на сайте показываются стандартные картинки.</p></div>
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
    $('galleryList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">🖼️</div><h3>Фото пока нет</h3><p>На сайте сейчас показываются стандартные картинки</p></div></div>';
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
