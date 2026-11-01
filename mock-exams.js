/* =====================================================================
   Stanford — Mock Exams + Trial Lesson form, connected to Supabase
   Add to index.html right AFTER main.js:
     <script src="mock-exams.js"></script>
   Then REMOVE from main.js: openPublicMockModal, closePublicMockModal,
   and the submit handlers for #publicMockForm and #trialForm
   (otherwise both files handle the same form).
   ===================================================================== */
(() => {
  // Same values you use in the admin panel (Supabase → Project Settings → API)
  const SUPABASE_URL = 'https://YOUR-PROJECT-ID.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- Translations ----------
  const T = {
    ru: {
      open: 'Открыта запись', almostFull: 'Мало мест', full: 'Мест нет',
      seatsLeft: 'Мест осталось', of: 'из', min: 'мин',
      register: 'Зарегистрироваться на Mock', noSeats: 'Мест нет',
      empty: 'Новые даты Mock Exam скоро появятся — следите за нашим Instagram.',
      loading: 'Загрузка расписания…',
      loadError: 'Не удалось загрузить расписание. Позвоните нам: +998 91 303-60-01',
      sending: 'Отправка…', submit: 'Подтвердить запись', trialSubmit: 'Записаться',
      errFull: 'К сожалению, места на этот экзамен закончились.',
      errClosed: 'Запись на этот экзамен закрыта.',
      errDup: 'Этот номер уже зарегистрирован на этот экзамен.',
      errPhone: 'Введите номер в формате +998 XX XXX-XX-XX',
      errName: 'Укажите имя и фамилию',
      errGeneric: 'Ошибка отправки. Попробуйте ещё раз или позвоните нам.',
      types: { full: 'IELTS Full Mock', academic: 'IELTS Academic', general: 'IELTS General', writing_speaking: 'Writing & Speaking' },
    },
    en: {
      open: 'Registration open', almostFull: 'Few seats left', full: 'Fully booked',
      seatsLeft: 'Seats left', of: 'of', min: 'min',
      register: 'Register for the mock', noSeats: 'Fully booked',
      empty: 'New mock exam dates are coming soon — follow our Instagram.',
      loading: 'Loading schedule…',
      loadError: 'Could not load the schedule. Call us: +998 91 303-60-01',
      sending: 'Sending…', submit: 'Confirm registration', trialSubmit: 'Sign up',
      errFull: 'Sorry, this exam is fully booked.',
      errClosed: 'Registration for this exam is closed.',
      errDup: 'This phone number is already registered for this exam.',
      errPhone: 'Enter the number as +998 XX XXX-XX-XX',
      errName: 'Enter your full name',
      errGeneric: 'Something went wrong. Please try again or call us.',
      types: { full: 'IELTS Full Mock', academic: 'IELTS Academic', general: 'IELTS General', writing_speaking: 'Writing & Speaking' },
    },
  };
  const lang = () => (document.querySelector('.lang-btn.active')?.dataset.lang === 'en' ? 'en' : 'ru');
  const t = (k) => T[lang()][k];

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Accepts "90 123 45 67", "+998901234567", "998-90-123-45-67" → "+998901234567"
  function normalizePhone(raw) {
    let d = String(raw).replace(/\D/g, '');
    if (d.length === 9) d = '998' + d;
    return /^998\d{9}$/.test(d) ? '+' + d : null;
  }

  function fmtDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(lang() === 'en' ? 'en-GB' : 'ru-RU',
      { weekday: 'short', day: 'numeric', month: 'long' });
  }

  // =====================================================================
  // MOCK EXAMS
  // =====================================================================
  const grid = document.getElementById('publicMockExamsGrid');
  let exams = [];

  async function loadExams() {
    if (!grid) return;
    if (!exams.length) grid.innerHTML = `<p class="mock-desc">${esc(t('loading'))}</p>`;
    const { data, error } = await sb.rpc('get_public_exams');
    if (error) {
      console.error('get_public_exams:', error);
      grid.innerHTML = `<p class="mock-desc">${esc(t('loadError'))}</p>`;
      return;
    }
    exams = data || [];
    renderExams();
  }

  function renderExams() {
    if (!grid) return;
    if (!exams.length) {
      grid.innerHTML = `<p class="mock-desc">${esc(t('empty'))}</p>`;
      return;
    }
    grid.innerHTML = exams.map((e) => {
      const left = Math.max(0, e.seats_left);
      const pct = Math.round((left / e.total_seats) * 100);
      const full = left === 0;
      const statusLabel = full ? t('full') : left <= 5 ? t('almostFull') : t('open');
      const desc = lang() === 'en' ? (e.description_en || e.description_ru) : (e.description_ru || e.description_en);
      const time = String(e.start_time).slice(0, 5);
      return `
        <div class="mock-card">
          <div>
            <div class="mock-tag-bar">
              <span class="mock-badge badge-ielts">${esc(T[lang()].types[e.exam_type] || 'IELTS')}</span>
              <span class="mock-badge badge-general">${esc(statusLabel)}</span>
            </div>
            <div class="mock-title">${esc(e.title)}</div>
            <p class="mock-desc">${esc(desc)}</p>
            <div class="mock-details">
              <div class="mock-detail-item"><span class="mock-detail-icon">📅</span> ${esc(fmtDate(e.exam_date))}</div>
              <div class="mock-detail-item"><span class="mock-detail-icon">⏰</span> ${esc(time)} · ${e.duration_min} ${esc(t('min'))}</div>
              <div class="mock-detail-item"><span class="mock-detail-icon">📍</span> ${esc(e.location)}</div>
            </div>
          </div>
          <div>
            <div class="mock-seats-wrap">
              <div class="mock-seats-info"><span>${esc(t('seatsLeft'))}</span> <span>${left} ${esc(t('of'))} ${e.total_seats}</span></div>
              <div class="mock-progress-bar"><div class="mock-progress-fill" style="width:${pct}%;"></div></div>
            </div>
            <button class="mock-btn" data-exam-id="${esc(e.id)}" ${full ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
              ${esc(full ? t('noSeats') : t('register'))}
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // Click on any "Register" button in the grid
  grid?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.mock-btn[data-exam-id]');
    if (!btn || btn.disabled) return;
    const exam = exams.find((x) => x.id === btn.dataset.examId);
    if (exam) openModal(exam);
  });

  // ---------- Registration modal ----------
  const overlay = document.getElementById('publicMockModal');
  const form = document.getElementById('publicMockForm');
  const formBody = document.getElementById('pmFormBody');
  const success = document.getElementById('pmSuccessMsg');
  const submitBtn = form?.querySelector('.pm-submit');

  // Error line inside the modal
  const errBox = document.createElement('p');
  errBox.style.cssText = 'color:var(--red);font-size:.84rem;margin:4px 0 0;display:none;';
  submitBtn?.before(errBox);
  const showErr = (msg) => { errBox.textContent = msg; errBox.style.display = msg ? 'block' : 'none'; };

  function openModal(exam) {
    document.getElementById('pmExamIdVal').value = exam.id;
    document.getElementById('pmExamTitleVal').value = exam.title;
    document.getElementById('pmSelectedExamName').textContent =
      `${exam.title} · ${fmtDate(exam.exam_date)}, ${String(exam.start_time).slice(0, 5)}`;
    form.reset();
    showErr('');
    formBody.style.display = '';
    success.classList.remove('active');
    overlay.classList.add('active');
    document.getElementById('pmStudentName').focus();
  }

  function closeModal() {
    overlay.classList.remove('active');
  }

  // Keep the names the HTML already uses (onclick="closePublicMockModal()")
  window.closePublicMockModal = closeModal;
  window.openPublicMockModal = (title) => {
    const exam = exams.find((x) => x.title === title) || exams[0];
    if (exam) openModal(exam);
  };

  overlay?.addEventListener('click', (ev) => { if (ev.target === overlay) closeModal(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeModal(); });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showErr('');

    const name = document.getElementById('pmStudentName').value.trim();
    const phone = normalizePhone(document.getElementById('pmStudentPhone').value);
    const examId = document.getElementById('pmExamIdVal').value;

    if (name.length < 2) return showErr(t('errName'));
    if (!phone) return showErr(t('errPhone'));

    submitBtn.disabled = true;
    submitBtn.textContent = t('sending');

    const { data, error } = await sb.rpc('register_for_exam', {
      p_exam_id: examId, p_full_name: name, p_phone: phone,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = t('submit');

    if (error) { console.error(error); return showErr(t('errGeneric')); }

    const messages = {
      full: t('errFull'), exam_closed: t('errClosed'),
      already_registered: t('errDup'), invalid_input: t('errPhone'),
    };
    if (data !== 'ok') {
      showErr(messages[data] || t('errGeneric'));
      if (data === 'full' || data === 'exam_closed') loadExams();
      return;
    }

    formBody.style.display = 'none';
    success.classList.add('active');
    loadExams(); // refresh seat counts
  });

  // =====================================================================
  // TRIAL LESSON FORM → leads table
  // =====================================================================
  const trialForm = document.getElementById('trialForm');
  const trialSuccess = document.getElementById('trialSuccess');

  trialForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    // Honeypot: if you add a hidden <input id="trialWebsite">, bots fill it, humans don't
    if (document.getElementById('trialWebsite')?.value) {
      trialForm.style.display = 'none';
      trialSuccess.classList.add('active');
      return;
    }

    const fName = document.getElementById('trialFieldName');
    const fPhone = document.getElementById('trialFieldPhone');
    const fCourse = document.getElementById('trialFieldCourse');
    const name = document.getElementById('trialName').value.trim();
    const phone = normalizePhone(document.getElementById('trialPhone').value);
    const course = document.getElementById('trialCourse').value;

    fName.classList.toggle('invalid', name.length < 2);
    fPhone.classList.toggle('invalid', !phone);
    fCourse.classList.toggle('invalid', !course);
    if (name.length < 2 || !phone || !course) return;

    const btn = trialForm.querySelector('.trial-submit');
    btn.disabled = true;
    btn.textContent = t('sending');

    const { error } = await sb.from('leads').insert({ name, phone, course });

    btn.disabled = false;
    btn.textContent = t('trialSubmit');

    if (error) {
      console.error(error);
      alert(t('errGeneric'));
      return;
    }
    trialForm.style.display = 'none';
    trialSuccess.classList.add('active');
  });

  // Re-render exam cards when the language switches
  document.querySelectorAll('.lang-btn').forEach((b) =>
    b.addEventListener('click', () => setTimeout(renderExams, 0)));

  loadExams();
})();
