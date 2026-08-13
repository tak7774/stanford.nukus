// ============================================================
// Stanford Admin Panel — Full Admin Logic
// Supabase auth + Mock Exams + Students + News
// ============================================================

const SUPABASE_URL = "https://nzbravxsxttloyicwcyq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56YnJhdnhzeHR0bG95aWN3Y3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNTg3NzAsImV4cCI6MjEwMTgzNDc3MH0.YFZfZRWHTAvxTYRDcmokgpvmjT9iflpA4KGJMcnMrFY";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }

  const { data: roleRow } = await sb.from('staff_roles').select('role').eq('email', email).single();
  if (!roleRow) {
    errEl.textContent = 'You are not listed in staff_roles. Ask the owner to add you.';
    errEl.style.display = 'block';
    await sb.auth.signOut();
    return;
  }

  session = { email, role: roleRow.role };
  showApp();
}

async function doLogout() {
  await sb.auth.signOut();
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
  const views = { dashboard: renderDashboard, exams: renderExams, students: renderStudents, news: renderNews };
  (views[page] || renderDashboard)();
}

// ── Toast ──
function toast(msg) {
  toastEl.innerHTML = '✅ ' + msg;
  toastEl.classList.add('active');
  setTimeout(() => toastEl.classList.remove('active'), 3000);
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
const courseBadge = { ielts: 'badge-red', general: 'badge-blue', advanced: 'badge-purple', kids: 'badge-green' };
const statusBadge = { new: 'badge-gold', contacted: 'badge-blue', enrolled: 'badge-green', declined: 'badge-gray', upcoming: 'badge-blue', in_progress: 'badge-gold', completed: 'badge-green', cancelled: 'badge-gray' };

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
async function renderDashboard() {
  mainContent.innerHTML = '<div class="page-header"><h1>Dashboard</h1><p>Overview of your centre</p></div><div class="stats-grid" id="dashStats">Loading...</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" id="dashCards"></div>';

  const [exams, students, news, examRegs] = await Promise.all([
    sb.from('mock_exams').select('*').order('exam_date', { ascending: false }),
    sb.from('trial_registrations').select('*').order('created_at', { ascending: false }),
    sb.from('news').select('*').order('created_at', { ascending: false }),
    sb.from('exam_registrations').select('*').order('registered_at', { ascending: false })
  ]);

  const examsData = exams.data || [];
  const studentsData = students.data || [];
  const newsData = news.data || [];
  const examRegsData = examRegs.data || [];

  const upcomingExams = examsData.filter(e => e.status === 'upcoming').length;
  const newStudents = studentsData.filter(s => s.status === 'new').length;

  $('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon gold">📝</div><div class="stat-num">${examsData.length}</div><div class="stat-label">Total Mock Exams</div></div>
    <div class="stat-card"><div class="stat-icon blue">📅</div><div class="stat-num">${upcomingExams}</div><div class="stat-label">Upcoming Exams</div></div>
    <div class="stat-card"><div class="stat-icon green">👥</div><div class="stat-num">${studentsData.length}</div><div class="stat-label">Trial Registrations</div></div>
    <div class="stat-card"><div class="stat-icon purple">🆕</div><div class="stat-num">${newStudents}</div><div class="stat-label">New (uncontacted)</div></div>
  `;

  // Recent activity
  const recentStudents = studentsData.slice(0, 5).map(s => `
    <div class="activity-item">
      <div class="activity-dot" style="background:var(--green)"></div>
      <div><div class="activity-text"><strong>${esc(s.full_name)}</strong> registered for ${courseLabels[s.course] || s.course}</div><div class="activity-time">${fmtRelative(s.created_at)}</div></div>
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

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

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
  let q = sb.from('mock_exams').select('*').order('exam_date', { ascending: false });
  if (filter) q = q.eq('status', filter);
  const { data } = await q;
  const exams = data || [];

  if (!exams.length) {
    $('examsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">📝</div><h3>No mock exams yet</h3><p>Create your first mock exam to get started</p></div></div>';
    return;
  }

  // Get registration counts
  const { data: regCounts } = await sb.from('exam_registrations').select('exam_id');
  const counts = {};
  (regCounts || []).forEach(r => { counts[r.exam_id] = (counts[r.exam_id] || 0) + 1; });

  $('examsList').innerHTML = '<div class="card"><table><thead><tr><th>Exam</th><th>Course</th><th>Date</th><th>Seats</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
    exams.map(e => `<tr>
      <td><strong style="color:var(--text)">${esc(e.title)}</strong>${e.description ? '<br><span style="font-size:.78rem;color:var(--text3)">' + esc(e.description).substring(0, 60) + '</span>' : ''}</td>
      <td><span class="badge ${courseBadge[e.course_type] || 'badge-gray'}">${courseLabels[e.course_type] || e.course_type}</span></td>
      <td>${fmtDateTime(e.exam_date)}<br><span style="font-size:.75rem;color:var(--text3)">${e.duration_minutes} min</span></td>
      <td>${counts[e.id] || 0} / ${e.max_seats}</td>
      <td><span class="badge ${statusBadge[e.status] || 'badge-gray'}">${e.status}</span></td>
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
    sb.from('mock_exams').select('*').eq('id', editId).single().then(({ data: e }) => {
      if (!e) return;
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
      <div class="form-group"><label>Date</label><input class="form-control" id="exDate" type="date" value="${date}"/></div>
      <div class="form-group"><label>Time</label><input class="form-control" id="exTime" type="time" value="${time}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Duration (minutes)</label><input class="form-control" id="exDur" type="number" value="${dur}"/></div>
      <div class="form-group"><label>Max Seats</label><input class="form-control" id="exSeats" type="number" value="${seats}"/></div>
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
  const row = { title, description: desc || null, course_type: course, exam_date: examDate, duration_minutes: dur, max_seats: seats, status, created_by: session.email };

  if (editId) {
    await sb.from('mock_exams').update(row).eq('id', editId);
    toast('Exam updated');
  } else {
    await sb.from('mock_exams').insert([row]);
    toast('Exam created');
  }
  closeModal();
  renderExams();
}

async function deleteExam(id) {
  if (!confirm('Delete this exam and all its registrations?')) return;
  await sb.from('mock_exams').delete().eq('id', id);
  toast('Exam deleted');
  renderExams();
}

async function viewExamRegs(examId) {
  const { data: exam } = await sb.from('mock_exams').select('*').eq('id', examId).single();
  const { data: regs } = await sb.from('exam_registrations').select('*').eq('exam_id', examId).order('registered_at', { ascending: false });
  const regsList = regs || [];

  openModal(`
    <div class="modal-title">${esc(exam?.title || 'Exam')} — Registrations (${regsList.length})<button class="modal-close" onclick="closeModal()">✕</button></div>
    ${regsList.length ? '<table><thead><tr><th>Name</th><th>Phone</th><th>Registered</th></tr></thead><tbody>' +
      regsList.map(r => `<tr><td style="color:var(--text)">${esc(r.full_name)}</td><td><a href="tel:${r.phone}" style="color:var(--gold)">${esc(r.phone)}</a></td><td>${fmtDate(r.registered_at)}</td></tr>`).join('') +
      '</tbody></table>' : '<div class="empty-state"><div class="icon">👥</div><h3>No registrations yet</h3><p>Students can register from the public site</p></div>'}
  `);
}

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
  let q = sb.from('trial_registrations').select('*').order('created_at', { ascending: false });
  if (sf) q = q.eq('status', sf);
  if (cf) q = q.eq('course', cf);
  const { data } = await q;
  const students = data || [];

  if (!students.length) {
    $('studentsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">👥</div><h3>No registrations found</h3><p>Registrations from the public site will appear here</p></div></div>';
    return;
  }

  $('studentsList').innerHTML = '<div class="card"><table><thead><tr><th>Name</th><th>Phone</th><th>Course</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>' +
    students.map(s => `<tr>
      <td style="color:var(--text);font-weight:500">${esc(s.full_name)}</td>
      <td><a href="tel:${s.phone}" style="color:var(--gold)">${esc(s.phone)}</a></td>
      <td><span class="badge ${courseBadge[s.course] || 'badge-gray'}">${courseLabels[s.course] || s.course}</span></td>
      <td><span class="badge ${statusBadge[s.status] || 'badge-gray'}">${s.status}</span></td>
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
  await sb.from('trial_registrations').update({ status }).eq('id', id);
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
  const { data } = await sb.from('news').select('*').order('created_at', { ascending: false });
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
    sb.from('news').select('*').eq('id', editId).single().then(({ data: n }) => {
      if (!n) return;
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

  if (editId) {
    await sb.from('news').update({ title, body }).eq('id', editId);
    toast('Post updated');
  } else {
    await sb.from('news').insert([{ title, body }]);
    toast('Post published');
  }
  closeModal();
  renderNews();
}

async function deleteNews(id) {
  if (!confirm('Delete this news post?')) return;
  await sb.from('news').delete().eq('id', id);
  toast('Post deleted');
  renderNews();
}

// ── Expose globals for inline onclick handlers ──
window.openExamModal = openExamModal;
window.deleteExam = deleteExam;
window.viewExamRegs = viewExamRegs;
window.updateStudentStatus = updateStudentStatus;
window.openNewsModal = openNewsModal;
window.deleteNews = deleteNews;
window.closeModal = closeModal;

// ── Init ──
// Check if already logged in
(async () => {
  const { data: { session: authSession } } = await sb.auth.getSession();
  if (authSession?.user) {
    const email = authSession.user.email;
    const { data: roleRow } = await sb.from('staff_roles').select('role').eq('email', email).single();
    if (roleRow) {
      session = { email, role: roleRow.role };
      showApp();
      return;
    }
  }
  loginWrap.style.display = 'flex';
})();
