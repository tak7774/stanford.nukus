// ============================================================
// Stanford Educational Centre — Mock Exam Multi-Step Portal
// ============================================================

// ── Backend API (Django on the same site: /api/...) ──
// Returns { data } on success or { error } with the server's JSON (e.g. { code: 'EXAM_FULL' }).
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

// ── State ──
let currentStep = 1;
let selectedGender = 'male';
let selectedFormat = 'paper';
let selectedSession = null; // { id, title, date, time, price, seatsLeft }
let selectedPayMethod = 'click';
let loadedSessions = [];

// ── DOM Initialization ──
document.addEventListener('DOMContentLoaded', async () => {
  await loadMockSessions();
});

// ── Step Navigation & Validation ──
window.goToStep = function(step) {
  if (step > currentStep) {
    if (!validateCurrentStep()) return;
  }

  currentStep = step;

  // Update Form Step Display
  document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
  const targetStep = document.getElementById(`step${step}`);
  if (targetStep) targetStep.classList.add('active');

  // Update Step Progress Indicators
  for (let i = 1; i <= 3; i++) {
    const ind = document.getElementById(`stepIndicator${i}`);
    if (ind) {
      if (i === currentStep) {
        ind.className = 'step-item active';
      } else if (i < currentStep) {
        ind.className = 'step-item completed';
      } else {
        ind.className = 'step-item';
      }
    }
  }

  // Populate Summary if entering Step 3
  if (step === 3) {
    populateSummary();
  }

  window.scrollTo({ top: 120, behavior: 'smooth' });
};

function validateCurrentStep() {
  if (currentStep === 1) {
    const fname = document.getElementById('regFirstName').value.trim();
    const lname = document.getElementById('regLastName').value.trim();
    const dob = document.getElementById('regBirthDate').value;
    const phone = document.getElementById('regPhone').value.trim();
    const passport = document.getElementById('regPassport').value.trim();

    if (!fname || !lname || !dob || !phone || !passport) {
      alert('Пожалуйста, заполните все обязательные поля (Имя, Фамилия, Дата рождения, Телефон, Паспорт/ID).');
      return false;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 9) {
      alert('Пожалуйста, введите корректный номер телефона.');
      return false;
    }
    return true;
  }

  if (currentStep === 2) {
    if (!selectedSession) {
      alert('Пожалуйста, выберите удобную сессию Mock Exam из списка.');
      return false;
    }
    return true;
  }

  return true;
}

// ── Selection Handlers ──
window.selectGender = function(val) {
  selectedGender = val;
  document.querySelectorAll('input[name="gender"]').forEach(inp => {
    inp.closest('.radio-card').classList.toggle('active', inp.value === val);
  });
};

window.selectFormat = function(fmt) {
  selectedFormat = fmt;
};

window.selectPayMethod = function(method, el) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-option').forEach(opt => opt.classList.remove('selected'));
  if (el) el.classList.add('selected');
};

// ── Fetch Open Mock Sessions from Supabase ──
async function loadMockSessions() {
  const container = document.getElementById('sessionsContainer');
  if (!container) return;

  let exams = [];
  const { data, error } = await apiRequest('GET', 'mock-exams/');
  if (!error && data && data.length > 0) {
    exams = data;
  } else if (error) {
    console.warn("Could not fetch mock exams:", error);
  }

  // Fallback demo sessions if DB is empty or connecting
  if (exams.length === 0) {
    exams = [
      {
        id: 1,
        title: 'IELTS Full Simulation #12 (Academic & GT)',
        exam_date: '2026-08-25T10:00:00',
        duration_minutes: 180,
        price_uzs: 150000,
        max_seats: 30,
        location: 'Stanford Main Center, Нукус'
      },
      {
        id: 2,
        title: 'IELTS Writing & Speaking Specialized Mock',
        exam_date: '2026-08-30T14:00:00',
        duration_minutes: 120,
        price_uzs: 120000,
        max_seats: 25,
        location: 'Stanford Main Center, Нукус'
      }
    ];
  }

  loadedSessions = exams;

  // Render Session Cards
  container.innerHTML = exams.map((ex, index) => {
    const dt = new Date(ex.exam_date);
    const dateStr = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const priceStr = (ex.price_uzs || 150000).toLocaleString('ru-RU') + ' сум';

    const isFirst = index === 0;
    if (isFirst && !selectedSession) {
      selectedSession = {
        id: ex.id,
        title: ex.title,
        dateStr: `${dateStr}, ${timeStr}`,
        price: ex.price_uzs || 150000,
        priceStr: priceStr
      };
    }

    return `
      <div class="session-card ${isFirst ? 'selected' : ''}" onclick="pickSession(${ex.id}, this)">
        <div>
          <div class="session-date">${dateStr} в ${timeStr}</div>
          <div class="session-meta">
            <span class="session-badge">${escapeHtml(ex.title)}</span>
            <span>📍 ${escapeHtml(ex.location || 'Stanford Main Center')}</span>
          </div>
        </div>
        <div class="session-seats">
          <div class="session-seats-num" style="color: var(--gold); font-size: 1.1rem;">${priceStr}</div>
          <div class="session-seats-label">Стоимость участия</div>
        </div>
      </div>
    `;
  }).join('');
}

window.pickSession = function(id, el) {
  document.querySelectorAll('.session-card').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');

  const sessionObj = loadedSessions.find(s => s.id === id);
  if (sessionObj) {
    const dt = new Date(sessionObj.exam_date);
    const dateStr = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const priceStr = (sessionObj.price_uzs || 150000).toLocaleString('ru-RU') + ' сум';

    selectedSession = {
      id: sessionObj.id,
      title: sessionObj.title,
      dateStr: `${dateStr}, ${timeStr}`,
      price: sessionObj.price_uzs || 150000,
      priceStr: priceStr
    };
  }
};

// ── Populate Summary Step 3 ──
function populateSummary() {
  const fname = document.getElementById('regFirstName').value.trim();
  const lname = document.getElementById('regLastName').value.trim();

  const candidateEl = document.getElementById('sumCandidateName');
  const titleEl = document.getElementById('sumExamTitle');
  const dateEl = document.getElementById('sumExamDate');
  const priceEl = document.getElementById('sumExamPrice');

  if (candidateEl) candidateEl.textContent = `${fname} ${lname}`;
  if (titleEl && selectedSession) titleEl.textContent = selectedSession.title;
  if (dateEl && selectedSession) dateEl.textContent = selectedSession.dateStr;
  if (priceEl && selectedSession) priceEl.textContent = selectedSession.priceStr;
}

// ── Submit Registration to the API & Generate Ticket ──
window.submitRegistration = async function() {
  const fname = document.getElementById('regFirstName').value.trim();
  const lname = document.getElementById('regLastName').value.trim();
  const dob = document.getElementById('regBirthDate').value;
  const phone = document.getElementById('regPhone').value.trim();
  const passport = document.getElementById('regPassport').value.trim();

  // Save registration. Payment status and amount are decided by the server
  // (always 'pending' until an admin verifies it in the admin panel).
  const { data: saved, error } = await apiRequest('POST', 'exam-registrations/', {
    exam_id: selectedSession ? selectedSession.id : null,
    full_name: `${fname} ${lname}`,
    phone: phone,
    first_name: fname,
    last_name: lname,
    birth_date: dob || null,
    gender: selectedGender,
    passport_id: passport,
    payment_method: selectedPayMethod
  });
  if (error) {
    console.warn('Could not save exam registration:', error);
    if (error.code === 'EXAM_FULL') alert('К сожалению, все места на этот экзамен заняты. Выберите другую дату.');
    else if (error.code === 'EXAM_CLOSED') alert('Запись на этот экзамен закрыта. Выберите другую дату.');
    else alert('Не удалось зарегистрироваться. Позвоните нам: +998 91 303-60-01');
    return;
  }

  // Ticket number is based on the saved registration id, so staff can look it up
  const ticketNo = 'ST-' + new Date().getFullYear() + '-MOCK-' + String(saved.id).padStart(4, '0');

  // Populate Digital Ticket (Step 4)
  const tNoEl = document.getElementById('tNo');
  const tNameEl = document.getElementById('tName');
  const tPassEl = document.getElementById('tPassport');
  const tExamEl = document.getElementById('tExam');
  const tDateEl = document.getElementById('tDate');
  const tStatusEl = document.getElementById('tPayStatus');

  if (tNoEl) tNoEl.textContent = ticketNo;
  if (tNameEl) tNameEl.textContent = `${fname} ${lname}`;
  if (tPassEl) tPassEl.textContent = passport;
  if (tExamEl && selectedSession) tExamEl.textContent = selectedSession.title;
  if (tDateEl && selectedSession) tDateEl.textContent = selectedSession.dateStr;
  if (tStatusEl) {
    if (selectedPayMethod === 'cash') {
      tStatusEl.textContent = '🟡 Оплата при входе (Наличными)';
      tStatusEl.style.color = '#B38600';
    } else {
      tStatusEl.textContent = `🟡 Ожидает подтверждения оплаты (${selectedPayMethod.toUpperCase()})`;
      tStatusEl.style.color = '#B38600';
    }
  }

  // Redirect to Payment Portal if Click or Payme selected
  if (selectedPayMethod === 'click') {
    // Simulated Click Checkout launcher
    console.log("Redirecting to Click payment portal...");
  } else if (selectedPayMethod === 'payme') {
    // Simulated Payme Checkout launcher
    console.log("Redirecting to Payme payment portal...");
  }

  // Show Step 4 Ticket
  goToStep(4);
};

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
