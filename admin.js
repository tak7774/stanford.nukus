// ============================================================
// Stanford Admin Panel — Full Admin Logic
// Django API (/api/...) + Analytics + Mock Exams + Students + News/events
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
    return { error: { message: 'Нет связи с сервером — проверьте интернет.' } };
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

  if (!email || !pw) { errEl.textContent = 'Введите email и пароль'; errEl.style.display = 'block'; return; }

  const { data, error } = await api('POST', 'auth/login/', { email, password: pw });
  if (error) { errEl.textContent = error.detail || 'Не удалось войти'; errEl.style.display = 'block'; return; }

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
  $('userRole').textContent = roleLabels[session.role] || session.role;
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
  const views = { dashboard: renderDashboard, analytics: renderAnalytics, exams: renderExams, students: renderStudents, news: renderNews, results: renderResults, teachers: renderTeachers };
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
  if (mins < 1) return 'только что';
  if (mins < 60) return mins + ' мин назад';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' ч назад';
  return Math.floor(hrs / 24) + ' дн назад';
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
const roleLabels = { owner: 'Владелец', editor: 'Сотрудник', staff: 'Сотрудник' };
const examStatusLabels = { upcoming: 'Предстоит', in_progress: 'Идёт', completed: 'Завершён', cancelled: 'Отменён' };
const statusBadge = { new: 'badge-gold', contacted: 'badge-blue', enrolled: 'badge-green', declined: 'badge-gray', upcoming: 'badge-blue', in_progress: 'badge-gold', completed: 'badge-green', cancelled: 'badge-gray' };

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
async function renderDashboard() {
  mainContent.innerHTML = '<div class="page-header"><h1>Обзор</h1><p>Главное о работе центра</p></div><div class="stats-grid" id="dashStats">Загрузка…</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px" id="dashCards"></div>';

  const { data: d, error } = await api('GET', 'admin/dashboard/');
  if (error) { $('dashStats').textContent = error.detail || 'Не удалось загрузить обзор'; return; }

  const studentsData = d.recent_students;
  const examRegsData = d.recent_exam_registrations;
  const upcomingExams = d.upcoming_exams;
  const newStudents = d.new_students;

  $('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-icon gold">📝</div><div class="stat-num">${esc(d.total_exams)}</div><div class="stat-label">Всего Mock-экзаменов</div></div>
    <div class="stat-card"><div class="stat-icon blue">📅</div><div class="stat-num">${esc(upcomingExams)}</div><div class="stat-label">Предстоящие экзамены</div></div>
    <div class="stat-card"><div class="stat-icon green">👥</div><div class="stat-num">${esc(d.total_students)}</div><div class="stat-label">Заявки с сайта</div></div>
    <div class="stat-card"><div class="stat-icon purple">🆕</div><div class="stat-num">${esc(newStudents)}</div><div class="stat-label">Новые (не звонили)</div></div>
  `;

  // Recent activity
  const recentStudents = studentsData.slice(0, 5).map(s => `
    <div class="activity-item">
      <div class="activity-dot" style="background:var(--green)"></div>
      <div><div class="activity-text"><strong>${esc(s.full_name)}</strong> — ${s.course === 'unsure' ? 'просит помочь выбрать курс' : 'заявка на ' + esc(courseLabels[s.course] || s.course)}</div><div class="activity-time">${fmtRelative(s.created_at)}</div></div>
    </div>`).join('');

  const recentExamRegs = examRegsData.slice(0, 5).map(r => `
    <div class="activity-item">
      <div class="activity-dot" style="background:var(--blue)"></div>
      <div><div class="activity-text"><strong>${esc(r.full_name)}</strong> записался на Mock-экзамен</div><div class="activity-time">${fmtRelative(r.registered_at)}</div></div>
    </div>`).join('');

  $('dashCards').innerHTML = `
    <div class="card"><div class="card-title">Последние заявки</div>${recentStudents || '<div class="empty-state"><p>Заявок пока нет</p></div>'}</div>
    <div class="card"><div class="card-title">Последние записи на Mock</div>${recentExamRegs || '<div class="empty-state"><p>Записей на Mock пока нет</p></div>'}</div>
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
  mainContent.innerHTML = `
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
      <div><h1>Mock-экзамены</h1><p>Кто записан, ввод баллов и публикация результатов. Результат виден студенту в кабинете только после кнопки «Завершено».</p></div>
      <button class="btn btn-primary" id="addExamBtn">+ Новый экзамен</button>
    </div>
    <div id="boardTabs"></div>
    <div id="boardBody">Загрузка…</div>`;
  $('addExamBtn').addEventListener('click', () => openExamModal());
  wireBoard();
  await loadBoard();
}

// ── The three mock tabs (+ the list of exam sessions) ──
let boardTab = 'upcoming';
let boardCounts = {};
const BOARD_TABS = [
  ['upcoming', 'Предстоящие'],
  ['taken', 'Сдали — ждут баллов'],
  ['completed', 'Завершённые'],
  ['sessions', 'Расписание экзаменов']
];

function paintBoardTabs() {
  const box = $('boardTabs');
  if (!box) return;
  box.innerHTML = '<div class="tabs" role="tablist">' + BOARD_TABS.map(([k, label]) =>
    `<button type="button" class="tab${boardTab === k ? ' active' : ''}" role="tab" aria-selected="${boardTab === k}" data-tab="${k}">${label}${boardCounts[k] !== undefined ? `<span class="count">${esc(boardCounts[k])}</span>` : ''}</button>`
  ).join('') + '</div>';
  box.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { boardTab = b.dataset.tab; loadBoard(); }));
}

function boardTable(head, rows) {
  return `<div class="card"><div class="table-wrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function boardEmpty(icon, title, text) {
  return `<div class="card"><div class="empty-state"><div class="icon">${icon}</div><h3>${title}</h3><p>${text}</p></div></div>`;
}
function whoCells(r) {
  return `<td style="color:var(--text);font-weight:600">${esc(r.first_name || '—')}</td><td style="color:var(--text);font-weight:600">${esc(r.last_name || '—')}</td><td><a href="tel:${esc(r.phone)}" style="white-space:nowrap">${esc(r.phone)}</a></td>`;
}
function studentCell(r) {
  return `<td><span style="color:var(--text);font-weight:600">${esc(((r.first_name || '') + ' ' + (r.last_name || '')).trim() || '—')}</span><br><a href="tel:${esc(r.phone)}" style="font-size:.8rem;white-space:nowrap">${esc(r.phone)}</a></td>`;
}
function scoreInputCell(r, band) {
  return `<td><input class="score-input" inputmode="decimal" data-band="${band}" value="${r[band] === null || r[band] === undefined ? '' : Number(r[band]).toFixed(1)}" placeholder="—" aria-label="${band}"/></td>`;
}

async function loadBoard() {
  const tab = boardTab;
  paintBoardTabs();
  const body = $('boardBody');
  if (!body) return;

  if (tab === 'sessions') {
    body.innerHTML = '<div class="filter-bar"><select id="examFilter"><option value="">Все статусы</option><option value="upcoming">Предстоит</option><option value="in_progress">Идёт</option><option value="completed">Завершён</option><option value="cancelled">Отменён</option></select></div><div id="examsList">Загрузка…</div>';
    $('examFilter').addEventListener('change', () => loadExamsList());
    await loadExamsList();
    return;
  }

  body.textContent = 'Загрузка…';
  const { data, error } = await api('GET', 'admin/mock-board/?tab=' + encodeURIComponent(tab));
  if (tab !== boardTab) return;           // the user already switched tab
  if (error) { body.textContent = errorMessage(error); return; }
  boardCounts = Object.assign({}, boardCounts, data.counts);
  paintBoardTabs();
  const rows = data.rows;

  if (tab === 'upcoming') {
    body.innerHTML = rows.length
      ? boardTable(['Дата и время', 'Имя', 'Фамилия', 'Телефон', 'Экзамен', 'Оплата'], rows.map(r => `<tr>
          <td style="white-space:nowrap">${esc(fmtDateTime(r.exam_date))}</td>${whoCells(r)}
          <td style="font-size:.84rem">${esc(r.exam_title)}</td>
          <td><span class="badge badge-${r.payment_status === 'verified' ? 'green' : 'gold'}">${r.payment_status === 'verified' ? 'Оплачено' : 'Ожидает'}</span></td>
        </tr>`).join(''))
      : boardEmpty('📅', 'Записанных студентов пока нет', 'Когда кто-то запишется на предстоящий экзамен, он появится здесь');
    return;
  }

  if (tab === 'taken') {
    body.innerHTML = rows.length
      ? '<p class="hint" style="margin:0 0 12px">Баллы Listening / Reading / Writing / Speaking: от 0 до 9 с шагом 0.5. Overall считается автоматически по правилам IELTS (среднее, округление до 0.5: .25 → .5, .75 → следующий целый балл). Сначала нажмите «Сохранить баллы», потом «Завершено» — студент увидит результат в кабинете.</p>'
        + boardTable(['Экзамен', 'Студент', 'L', 'R', 'W', 'S', 'Overall', ''], rows.map(r => {
          const complete = ['listening', 'reading', 'writing', 'speaking'].every(b => r[b] !== null && r[b] !== undefined);
          return `<tr data-row="${r.id}">
            <td style="white-space:nowrap">${esc(fmtDateTime(r.exam_date))}<br><span class="muted" style="font-size:.75rem">${esc(r.exam_title)}</span></td>${studentCell(r)}
            ${scoreInputCell(r, 'listening')}${scoreInputCell(r, 'reading')}${scoreInputCell(r, 'writing')}${scoreInputCell(r, 'speaking')}
            <td><span class="overall-pill" data-overall>${bandText(r.overall)}</span></td>
            <td><div class="board-actions">
              <button class="btn btn-sm btn-secondary" data-act="save" data-id="${r.id}">Сохранить баллы</button>
              <button class="btn btn-sm btn-primary" data-act="publish" data-id="${r.id}" ${complete ? '' : 'disabled title="Сначала сохраните все четыре балла"'}>Завершено</button>
            </div></td></tr>`;
        }).join(''))
      : boardEmpty('✅', 'Все баллы введены', 'Здесь появятся студенты, чей экзамен уже прошёл и чьи результаты ещё не опубликованы');
    return;
  }

  // completed
  body.innerHTML = rows.length
    ? boardTable(['Экзамен', 'Студент', 'L / R / W / S', 'Overall', 'Опубликовал', ''], rows.map(r => `<tr>
        <td style="white-space:nowrap">${esc(fmtDateTime(r.exam_date))}<br><span class="muted" style="font-size:.75rem">${esc(r.exam_title)}</span></td>${studentCell(r)}
        <td class="bands">${[r.listening, r.reading, r.writing, r.speaking].map(bandText).join(' / ')}</td>
        <td><span class="overall-pill">${bandText(r.overall)}</span></td>
        <td style="font-size:.84rem">${esc(r.results_published_by || '—')}<br><span class="muted" style="font-size:.75rem">${esc(fmtDateTime(r.results_published_at))}</span></td>
        <td>${session.role === 'owner' ? `<button class="btn btn-sm btn-secondary" data-act="unpublish" data-id="${r.id}">Снять публикацию</button>` : ''}</td>
      </tr>`).join(''))
    : boardEmpty('🏁', 'Опубликованных результатов пока нет', 'После кнопки «Завершено» результат попадёт сюда и в кабинет студента');
}

// One set of listeners for the board (the board element lives as long as the page is open)
function wireBoard() {
  const body = $('boardBody');
  const bandsOf = tr => ['listening', 'reading', 'writing', 'speaking'].map(b => tr.querySelector(`.score-input[data-band="${b}"]`).value.trim().replace(',', '.'));

  body.addEventListener('input', e => {
    const inp = e.target.closest('.score-input');
    if (!inp) return;
    const tr = inp.closest('tr');
    inp.classList.toggle('bad', inp.value.trim() !== '' && !isBand(inp.value.trim().replace(',', '.')));
    tr.querySelector('[data-overall]').textContent = ieltsOverall(bandsOf(tr)) ?? '—';
    const publish = tr.querySelector('[data-act="publish"]');
    if (publish) { publish.disabled = true; publish.title = 'Сначала сохраните баллы'; }
  });

  body.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id, act = btn.dataset.act, tr = btn.closest('tr');

    if (act === 'save') {
      const values = bandsOf(tr);
      const names = ['listening', 'reading', 'writing', 'speaking'];
      const payload = {};
      for (let i = 0; i < 4; i++) {
        if (values[i] !== '' && !isBand(values[i])) { toast(`${names[i]}: от 0 до 9 с шагом 0.5`, 'error'); return; }
        payload[names[i]] = values[i] === '' ? null : values[i];
      }
      btn.disabled = true;
      const { data, error } = await api('PATCH', 'admin/exam-registrations/' + id + '/', payload);
      btn.disabled = false;
      if (error) { showApiError(error); return; }
      tr.querySelector('[data-overall]').textContent = bandText(data.overall);
      const publish = tr.querySelector('[data-act="publish"]');
      if (publish) {
        publish.disabled = data.overall === null;
        publish.title = data.overall === null ? 'Сначала сохраните все четыре балла' : '';
      }
      toast(data.overall !== null ? `Баллы сохранены. Overall ${bandText(data.overall)}` : 'Баллы сохранены');
    }

    if (act === 'publish') {
      if (!confirm('Опубликовать результат? После этого студент увидит баллы в своём кабинете, а изменить их сможет только владелец.')) return;
      btn.disabled = true;
      const { error } = await api('POST', 'admin/exam-registrations/' + id + '/publish/');
      if (error) { btn.disabled = false; showApiError(error); return; }
      toast('Результат опубликован — студент видит его в кабинете');
      loadBoard();
    }

    if (act === 'unpublish') {
      if (!confirm('Снять публикацию? Студент больше не увидит результат, пока вы не нажмёте «Завершено» снова.')) return;
      const { error } = await api('POST', 'admin/exam-registrations/' + id + '/unpublish/');
      if (error) { showApiError(error); return; }
      toast('Публикация снята');
      loadBoard();
    }
  });
}

async function loadExamsList() {
  const filterEl = $('examFilter');
  const filter = filterEl ? filterEl.value : '';
  const { data, error } = await api('GET', 'admin/exams/' + (filter ? '?status=' + encodeURIComponent(filter) : ''));
  if (error) { $('examsList').textContent = error.detail || 'Не удалось загрузить экзамены'; return; }
  const exams = data || [];

  if (!exams.length) {
    $('examsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">📝</div><h3>Экзаменов пока нет</h3><p>Создайте первый Mock-экзамен — он появится на сайте</p></div></div>';
    return;
  }

  // Registration counts come with each exam from the API
  const counts = {};
  exams.forEach(e => { counts[e.id] = e.registered; });

  $('examsList').innerHTML = '<div class="card"><table><thead><tr><th>Экзамен</th><th>Курс</th><th>Дата</th><th>Места</th><th>Статус</th><th>Действия</th></tr></thead><tbody>' +
    exams.map(e => `<tr>
      <td><strong style="color:var(--text)">${esc(e.title)}</strong>${e.description ? '<br><span style="font-size:.78rem;color:var(--text3)">' + esc(e.description.substring(0, 60)) + '</span>' : ''}</td>
      <td><span class="badge ${courseBadge[e.course_type] || 'badge-gray'}">${esc(courseLabels[e.course_type] || e.course_type)}</span></td>
      <td>${fmtDateTime(e.exam_date)}<br><span style="font-size:.75rem;color:var(--text3)">${esc(e.duration_minutes)} мин</span></td>
      <td>${esc(counts[e.id] || 0)} / ${esc(e.max_seats)}</td>
      <td><span class="badge ${statusBadge[e.status] || 'badge-gray'}">${esc(examStatusLabels[e.status] || e.status)}</span></td>
      <td><button class="btn btn-sm btn-secondary" onclick="viewExamRegs(${e.id})">👥 Записи</button> <button class="btn btn-sm btn-secondary" onclick="openExamModal(${e.id})">✏️</button>${session.role === 'owner' ? ` <button class="btn btn-sm btn-danger" onclick="deleteExam(${e.id})">🗑</button>` : ''}</td>
    </tr>`).join('') + '</tbody></table></div>';
}

function openExamModal(editId) {
  const isEdit = typeof editId === 'number';
  const title = isEdit ? 'Изменить экзамен' : 'Новый экзамен';

  openModal(`
    <div class="modal-title">${title}<button class="modal-close" onclick="closeModal()">✕</button></div>
    <div id="examFormBody">Загрузка…</div>
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
    <div class="form-group"><label>Название</label><input class="form-control" id="exTitle" value="${esc(title)}" placeholder="например: IELTS CD Mock №5"/></div>
    <div class="form-group"><label>Описание</label><textarea class="form-control" id="exDesc" placeholder="Необязательно">${esc(desc)}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Курс</label><select class="form-control" id="exCourse"><option value="ielts" ${course==='ielts'?'selected':''}>IELTS Preparation</option><option value="general" ${course==='general'?'selected':''}>General English</option><option value="advanced" ${course==='advanced'?'selected':''}>Advanced English</option><option value="kids" ${course==='kids'?'selected':''}>Kids English</option></select></div>
      <div class="form-group"><label>Статус</label><select class="form-control" id="exStatus"><option value="upcoming" ${status==='upcoming'?'selected':''}>Предстоит</option><option value="in_progress" ${status==='in_progress'?'selected':''}>Идёт</option><option value="completed" ${status==='completed'?'selected':''}>Завершён</option><option value="cancelled" ${status==='cancelled'?'selected':''}>Отменён</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Дата</label><input class="form-control" id="exDate" type="date" value="${esc(date)}"/></div>
      <div class="form-group"><label>Время (Ташкент)</label><input class="form-control" id="exTime" type="time" value="${esc(time)}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Длительность (минуты)</label><input class="form-control" id="exDur" type="number" value="${esc(dur)}"/></div>
      <div class="form-group"><label>Всего мест</label><input class="form-control" id="exSeats" type="number" value="${esc(seats)}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Цена (сум)</label><input class="form-control" id="exPrice" type="number" min="0" step="1000" value="${esc(price ?? '')}" placeholder="например: 150000"/></div>
      <div class="form-group"><label>Место</label><input class="form-control" id="exLocation" value="${esc(location || '')}" placeholder="например: Stanford Main Center, Nukus"/></div>
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Отмена</button><button class="btn btn-primary" id="saveExamBtn">${editId ? 'Сохранить' : 'Создать экзамен'}</button></div>
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

  if (!title || !date || !time) { alert('Укажите название, дату и время'); return; }
  if (priceText === '' || isNaN(price) || price < 0) { alert('Укажите цену в сумах (не меньше 0)'); return; }
  if (!location) { alert('Укажите место проведения'); return; }

  const examDate = new Date(date + 'T' + time).toISOString();
  const row = { title, description: desc || null, course_type: course, exam_date: examDate, duration_minutes: dur, max_seats: seats, status, price_uzs: price, location };

  const { error } = editId
    ? await api('PATCH', 'admin/exams/' + editId + '/', row)
    : await api('POST', 'admin/exams/', row);
  if (error) { showApiError(error); return; }
  toast(editId ? 'Экзамен сохранён' : 'Экзамен создан');
  closeModal();
  renderExams();
}

async function deleteExam(id) {
  if (!confirm('Удалить этот экзамен и все записи на него?')) return;
  const { error } = await api('DELETE', 'admin/exams/' + id + '/');
  if (error) { showApiError(error); return; }
  toast('Экзамен удалён');
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
    <div class="modal-title">${esc(exam?.title || 'Экзамен')} — записи (${regsList.length})<button class="modal-close" onclick="closeModal()" aria-label="Закрыть">✕</button></div>
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
      '</tbody></table></div>' : '<div class="empty-state"><div class="icon">👥</div><h3>Записей пока нет</h3><p>Студенты записываются на сайте, на странице «IELTS CD Mock Exam»</p></div>'}
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
      <select id="studFilter"><option value="">Все статусы</option><option value="new">🆕 Новая</option><option value="contacted">📞 Связались</option><option value="enrolled">✅ Записан</option><option value="declined">❌ Отказ</option></select>
      <select id="studCourseFilter"><option value="">Все курсы</option><option value="ielts">IELTS Preparation</option><option value="general">General English</option><option value="advanced">Advanced English</option><option value="kids">Kids English</option><option value="unsure">Не знает</option></select>
    </div>
    <div id="studentsList">Загрузка…</div>
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
  if (error) { $('studentsList').textContent = error.detail || 'Не удалось загрузить заявки'; return; }
  const students = data || [];

  if (!students.length) {
    $('studentsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">👥</div><h3>Заявок не найдено</h3><p>Здесь появляются заявки с сайта</p></div></div>';
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
// NEWS, EVENTS, SPEAKING CLUBS (shown on the main site right after the first screen)
// ════════════════════════════════════════════
const newsKindLabels = { news: 'Новость', event: 'Мероприятие', speaking_club: 'Speaking club', other: 'Другое' };
const newsKindBadge = { news: 'badge-gray', event: 'badge-blue', speaking_club: 'badge-green', other: 'badge-purple' };
let newsRows = [];

async function renderNews() {
  mainContent.innerHTML = `
    <div class="page-header page-header-row" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
      <div><h1>Новости и события</h1><p>Новости, ближайшие мероприятия, speaking clubs и другие события — с фото и текстом. Добавлять можно сколько угодно. На главной странице они идут сразу после первого экрана: события с датой сверху (ближайшие первыми), потом новости. Прошедшие события с сайта пропадают сами.</p></div>
      <button class="btn btn-primary" id="addNewsBtn">+ Добавить</button>
    </div>
    <div id="newsList">Загрузка…</div>`;
  $('addNewsBtn').addEventListener('click', () => openNewsModal());
  await loadNews();
}

async function loadNews() {
  const { data, error } = await api('GET', 'admin/news/');
  if (error) { $('newsList').textContent = errorMessage(error); return; }
  newsRows = data || [];
  if (!newsRows.length) {
    $('newsList').innerHTML = '<div class="card"><div class="empty-state"><div class="icon">📰</div><h3>Пока ничего нет</h3><p>Добавьте первую новость или мероприятие — оно появится на главной странице</p></div></div>';
    return;
  }
  const now = Date.now();
  $('newsList').innerHTML = newsRows.map(n => {
    const past = n.event_date && new Date(n.event_date).getTime() < now;
    const badges = [`<span class="badge ${newsKindBadge[n.kind] || 'badge-gray'}">${esc(newsKindLabels[n.kind] || n.kind)}</span>`];
    if (n.event_date) badges.push(`<span class="badge badge-gold">${esc(fmtDateTime(n.event_date))}</span>`);
    if (past) badges.push('<span class="badge badge-gray">Прошло — скрыто на сайте</span>');
    if (!n.is_published) badges.push('<span class="badge badge-warn">Скрыто с сайта</span>');
    const excerpt = (n.body || '').length > 220 ? n.body.slice(0, 220) + '…' : (n.body || '');
    return `
    <div class="card news-admin">
      ${n.image_url ? `<img class="news-thumb" src="${esc(n.image_url)}" alt="" loading="lazy"/>` : '<span class="news-thumb" aria-hidden="true"></span>'}
      <div class="news-admin-main">
        <div class="news-admin-badges">${badges.join('')}</div>
        <h3 class="news-admin-title">${esc(n.title)}</h3>
        ${n.location ? `<div class="muted" style="font-size:.84rem">📍 ${esc(n.location)}</div>` : ''}
        ${excerpt ? `<p class="news-admin-text">${esc(excerpt)}</p>` : ''}
        <div class="news-admin-actions">
          <label class="switch"><input type="checkbox" ${n.is_published ? 'checked' : ''} onchange="toggleNewsPublished(${n.id}, this.checked)"/> На сайте</label>
          <button class="btn btn-sm btn-secondary" onclick="openNewsModal(${n.id})">✏️ Изменить</button>
          ${session.role === 'owner' ? `<button class="btn btn-sm btn-danger" onclick="deleteNews(${n.id})">🗑 Удалить</button>` : ''}
          <span class="muted" style="font-size:.75rem">Добавлено ${esc(fmtDate(n.created_at))}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openNewsModal(editId) {
  const n = newsRows.find(x => x.id === editId) || { title: '', body: '', kind: 'news', event_date: null, location: '', is_published: true, image_url: null };
  let dateValue = '';
  if (n.event_date) {
    const d = new Date(n.event_date);
    const p = x => String(x).padStart(2, '0');
    dateValue = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  openModal(`
    <div class="modal-title">${editId ? 'Изменить' : 'Добавить'}<button class="modal-close" onclick="closeModal()" aria-label="Закрыть">✕</button></div>
    <div class="form-row">
      <div class="form-group"><label for="newsKind">Что это</label><select class="form-control" id="newsKind">${Object.entries(newsKindLabels).map(([v, l]) => `<option value="${v}" ${n.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-group"><label for="newsDate">Дата и время (Ташкент)</label><input class="form-control" type="datetime-local" id="newsDate" value="${esc(dateValue)}"/></div>
    </div>
    <p class="hint" style="margin:-6px 0 14px">Дата нужна для мероприятий и speaking clubs: ближайшие показываются первыми, а после начала пропадают с сайта. У новости дату можно не указывать.</p>
    <div class="form-group"><label for="newsTitle">Заголовок</label><input class="form-control" id="newsTitle" maxlength="300" value="${esc(n.title)}" placeholder="например: Speaking club — обсуждаем путешествия"/></div>
    <div class="form-group"><label for="newsPlace">Место (необязательно)</label><input class="form-control" id="newsPlace" maxlength="300" value="${esc(n.location || '')}" placeholder="например: Stanford, 2 этаж"/></div>
    <div class="form-group"><label for="newsBody">Текст</label><textarea class="form-control" id="newsBody" rows="6" maxlength="10000" placeholder="Подробности: о чём, для кого, как попасть, что взять с собой">${esc(n.body || '')}</textarea></div>
    ${photoPickerHtml(n.image_url, false, 'Фото (необязательно)', 'Лучше горизонтальное фото. Без фото на сайте будет жёлтая карточка с датой.')}
    <label class="switch"><input type="checkbox" id="newsPublished" ${n.is_published ? 'checked' : ''}/> Показывать на сайте</label>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Отмена</button><button class="btn btn-primary" id="saveNewsBtn">${editId ? 'Сохранить' : 'Опубликовать'}</button></div>
  `, true);
  wirePhotoPicker();
  $('saveNewsBtn').addEventListener('click', () => saveNews(editId));
}

async function saveNews(editId) {
  const title = $('newsTitle').value.trim();
  const kind = $('newsKind').value;
  const dateValue = $('newsDate').value;
  if (!title) { toast('Укажите заголовок', 'error'); return; }
  if ((kind === 'event' || kind === 'speaking_club') && !dateValue) { toast('Укажите дату и время — иначе событие не попадёт в «ближайшие»', 'error'); return; }
  const fd = new FormData();
  fd.append('title', title);
  fd.append('kind', kind);
  fd.append('body', $('newsBody').value.trim());
  fd.append('location', $('newsPlace').value.trim());
  fd.append('event_date', dateValue ? new Date(dateValue).toISOString() : '');
  fd.append('is_published', $('newsPublished').checked ? 'true' : 'false');
  $('saveNewsBtn').disabled = true;
  await appendPhoto(fd);
  const { error } = editId ? await apiUpload('PATCH', 'admin/news/' + editId + '/', fd) : await apiUpload('POST', 'admin/news/', fd);
  if ($('saveNewsBtn')) $('saveNewsBtn').disabled = false;
  if (error) { showApiError(error); return; }
  toast(editId ? 'Сохранено' : 'Опубликовано');
  closeModal();
  loadNews();
}

async function toggleNewsPublished(id, published) {
  const { error } = await api('PATCH', 'admin/news/' + id + '/', { is_published: published });
  if (error) showApiError(error); else toast(published ? 'Показано на сайте' : 'Скрыто с сайта');
  loadNews();
}

async function deleteNews(id) {
  if (!confirm('Удалить навсегда?')) return;
  const { error } = await api('DELETE', 'admin/news/' + id + '/');
  if (error) { showApiError(error); return; }
  toast('Удалено');
  loadNews();
}

// Upload helpers shared by news, results and teachers
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
    return { error: { detail: 'Нет связи с сервером — проверьте интернет.' } };
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


// ════════════════════════════════════════════
// ANALYTICS (visitors, page views, mock registrations)
// ════════════════════════════════════════════
const pageNames = { '/': 'Главная страница', '/mock.html': 'Mock Exam', '/portal.html': 'Кабинет' };
const rangeLabels = { today: 'Сегодня', d7: '7 дней', d30: '30 дней' };
let analytics = null;
let analyticsRange = 'd7';

async function renderAnalytics() {
  mainContent.innerHTML = `
    <div class="page-header"><h1>Аналитика</h1>
      <p>Сколько людей заходит на сайт и сколько из них записывается на Mock. Личные данные не собираются: ни IP-адресов, ни имён — только случайный номер браузера, страница, откуда пришли и телефон это или компьютер.</p></div>
    <div id="anaBody">Загрузка…</div>`;
  const { data, error } = await api('GET', 'admin/analytics/');
  if (error) { $('anaBody').textContent = errorMessage(error); return; }
  analytics = data;
  paintAnalytics();
}

function pct(v) { return v === null || v === undefined ? '—' : String(v).replace('.', ',') + '%'; }
function fmtDayShort(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''); }

function paintAnalytics() {
  const p = analytics.periods;
  const row = (label, key, fmt) => `<tr><th scope="row">${label}</th>${['today', 'd7', 'd30'].map(k => `<td>${fmt ? fmt(p[k][key]) : esc(p[k][key])}</td>`).join('')}</tr>`;
  const days = analyticsRange === 'd30' ? analytics.daily : analytics.daily.slice(-7);
  const pages = analytics.pages[analyticsRange] || [];
  const maxViews = Math.max(1, ...pages.map(x => x.views));
  const total = days.reduce((a, d) => ({ visitors: a.visitors + d.visitors, registrations: a.registrations + d.registrations }), { visitors: 0, registrations: 0 });

  $('anaBody').innerHTML = `
    <div class="card">
      <div class="card-title">Сводка</div>
      <div class="table-wrap"><table class="ana-table">
        <thead><tr><th></th><th>Сегодня</th><th>7 дней</th><th>30 дней</th></tr></thead>
        <tbody>
          ${row('Уникальные посетители', 'visitors')}
          ${row('Просмотры страниц', 'views')}
          ${row('Записи на Mock', 'registrations')}
          ${row('Конверсия', 'conversion', pct)}
        </tbody></table></div>
      <p class="hint">Конверсия = записи на Mock ÷ уникальные посетители за тот же период. Один человек, заходивший много раз, считается один раз. «7 дней» и «30 дней» включают сегодня.</p>
    </div>

    <div class="range-switch" role="group" aria-label="Период для страниц и графиков">
      ${Object.entries(rangeLabels).map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${analyticsRange === k}">${l}</button>`).join('')}
    </div>

    <div class="card">
      <div class="card-title">Просмотры по страницам — ${rangeLabels[analyticsRange].toLowerCase()}</div>
      ${pages.length ? `<div class="table-wrap"><table class="ana-table"><thead><tr><th>Страница</th><th>Просмотры</th><th>Посетители</th><th class="ana-share-col"></th></tr></thead><tbody>
        ${pages.map(x => `<tr><th scope="row">${esc(pageNames[x.path] || x.path)}</th><td>${esc(x.views)}</td><td>${esc(x.visitors)}</td><td class="ana-share-col"><span class="ana-share"><i style="width:${Math.round(x.views * 100 / maxViews)}%"></i></span></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty-state" style="padding:24px"><p>За этот период просмотров пока нет</p></div>'}
    </div>

    <div class="card">
      <div class="card-title">Посетители по дням <span class="chart-total">${total.visitors} за ${days.length} ${days.length === 1 ? 'день' : 'дн.'} (сумма по дням)</span></div>
      <div class="chart-box" id="chartVisitors">${barChartSvg(days, 'visitors', 'var(--blue)', 'посетителей')}<div class="chart-tip" role="status"></div></div>
    </div>

    <div class="card">
      <div class="card-title">Записи на Mock по дням <span class="chart-total">${total.registrations} за ${days.length} ${days.length === 1 ? 'день' : 'дн.'}</span></div>
      <div class="chart-box" id="chartRegs">${barChartSvg(days, 'registrations', 'var(--green)', 'записей')}<div class="chart-tip" role="status"></div></div>
      <p class="hint">${analyticsRange === 'today' ? 'Для «Сегодня» показаны последние 7 дней. ' : ''}Два графика, а не один: посетителей намного больше, чем записей, и на общей шкале записи были бы не видны.</p>
    </div>

    <details class="card ana-details">
      <summary>Показать таблицей</summary>
      <div class="table-wrap"><table class="ana-table"><thead><tr><th>День</th><th>Посетители</th><th>Просмотры</th><th>Записи на Mock</th></tr></thead><tbody>
        ${days.slice().reverse().map(d => `<tr><th scope="row">${esc(fmtDayShort(d.date))}</th><td>${esc(d.visitors)}</td><td>${esc(d.views)}</td><td>${esc(d.registrations)}</td></tr>`).join('')}
      </tbody></table></div>
    </details>`;

  $('anaBody').querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => { analyticsRange = b.dataset.range; paintAnalytics(); }));
  attachChartTip($('chartVisitors'), days, 'visitors', ['посетитель', 'посетителя', 'посетителей']);
  attachChartTip($('chartRegs'), days, 'registrations', ['запись', 'записи', 'записей']);
}

function niceMax(v) {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

// One measure per chart (no second axis). Bars have rounded tops, a gap between them, a light grid.
function barChartSvg(days, key, color, noun) {
  const W = 720, H = 210, L = 38, R = 8, T = 10, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(0, ...days.map(d => d[key])));
  const n = days.length, slot = pw / n, bw = Math.max(3, Math.min(30, slot - 4));
  const y = v => T + ph - (v / max) * ph;
  const step = n > 10 ? 5 : 1;
  let g = '';
  [0, max / 2, max].forEach(t => {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? 'var(--border2)' : 'var(--border)'}" stroke-width="1"/>`
      + `<text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--text3)">${Number.isInteger(t) ? t : t.toFixed(1)}</text>`;
  });
  days.forEach((d, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const h = (d[key] / max) * ph;
    if (h > 0) {
      const r = Math.min(4, bw / 2, h), top = T + ph - h;
      g += `<path d="M${x} ${T + ph}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + bw - r}Q${x + bw} ${top} ${x + bw} ${top + r}V${T + ph}Z" fill="${color}"/>`;
    }
    if ((n - 1 - i) % step === 0) g += `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--text3)">${esc(fmtDayShort(d.date))}</text>`;
    g += `<rect class="chart-hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ph}" fill="transparent" data-i="${i}" tabindex="0" aria-label="${esc(fmtDayShort(d.date) + ': ' + d[key] + ' ' + noun)}"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="График: ${esc(noun)} по дням">${g}</svg>`;
}

function attachChartTip(box, days, key, words) {
  const tip = box.querySelector('.chart-tip');
  const word = n => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? words[0] : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? words[1] : words[2]; };
  const show = (el, evt) => {
    const d = days[+el.dataset.i];
    tip.textContent = `${fmtDayShort(d.date)} — ${d[key]} ${word(d[key])}`;
    tip.classList.add('show');
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x = (evt && evt.clientX !== undefined && evt.type.startsWith('mouse') ? evt.clientX : r.left + r.width / 2) - b.left;
    tip.style.left = Math.max(60, Math.min(b.width - 60, x)) + 'px';
  };
  box.querySelectorAll('.chart-hit').forEach(el => {
    el.addEventListener('mousemove', e => show(el, e));
    el.addEventListener('focus', e => show(el, e));
    el.addEventListener('mouseleave', () => tip.classList.remove('show'));
    el.addEventListener('blur', () => tip.classList.remove('show'));
  });
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
function photoPickerHtml(currentUrl, square, label, hint) {
  return `
    <div class="form-group"><label>${esc(label || (square ? 'Фото преподавателя' : 'Фото сертификата (необязательно)'))}</label>
      <div class="photo-pick">
        <img class="photo-preview ${square ? 'square' : ''}" id="photoPreview" src="${currentUrl ? esc(currentUrl) : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='}" alt=""/>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
          <button type="button" class="btn btn-sm btn-secondary" id="photoPickBtn">📷 Выбрать фото</button>
          <button type="button" class="btn btn-sm btn-secondary" id="photoRemoveBtn" ${currentUrl ? '' : 'style="display:none"'}>Убрать фото</button>
          <span class="hint">${esc(hint || (square ? 'Лучше квадратное или вертикальное фото, лицо по центру.' : 'Вертикальное фото 9:16. Без фото карточка будет жёлтой.'))}</span>
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
window.toggleNewsPublished = toggleNewsPublished;
window.closeModal = closeModal;
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
