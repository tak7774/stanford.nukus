// ============================================================
// Stanford Language Center — main page (index.html)
// Texts: translations.js · language switching and dates: i18n.js
// ============================================================
const { t } = window.I18N;

// ── Backend API (Django on the same site: /api/...) ──
// Returns { data } on success or { error } with the server's JSON.
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

// Escape a value for use inside HTML text AND inside quoted attributes.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COURSE_KEYS = { kids: 'course1', general: 'course2', advanced: 'course3', ielts: 'course4' };
const COURSE_NAMES = { kids: 'Kids English', general: 'General English', advanced: 'Advanced English', ielts: 'IELTS Preparation' };

// ── Phone: "+998 90 123-45-67" while typing ──
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
  if (!input) return;
  input.addEventListener('focus', () => { if (!input.value) input.value = '+998 '; });
  input.addEventListener('input', () => {
    const formatted = formatUzPhone(input.value);
    input.value = formatted === '+998' ? '+998 ' : formatted;
  });
  input.addEventListener('blur', () => { if (input.value.replace(/\D/g, '') === '998') input.value = ''; });
}
const phoneIsComplete = v => String(v).replace(/\D/g, '').length === 12; // 998 + 9 digits

function setInvalid(form, field, invalid) {
  const el = form.querySelector(`[data-field="${field}"]`);
  if (el) el.classList.toggle('invalid', invalid);
  return !invalid;
}

// Sends a lead to trial_registrations. source: 'course_card' | 'apply_form'
async function sendLead(payload, button) {
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = t('f-sending');
  const { error } = await apiRequest('POST', 'trial-registrations/', payload);
  button.disabled = false;
  button.innerHTML = label;
  if (error) {
    console.warn('Could not save the request:', error);
    alert(t('alert-send-fail'));
    return false;
  }
  return true;
}

// ════════ Header ════════
function initHeader() {
  const navbar = document.getElementById('navbar');
  const update = () => navbar.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();

  const burger = document.getElementById('hamburger');
  const setMenu = open => {
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  document.querySelectorAll('#navLinks a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 1025px)').addEventListener('change', e => { if (e.matches) setMenu(false); });
}

// ════════ FAQ ════════
function initFaq() {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const open = !item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(other => {
        if (other === item) return;
        other.classList.remove('open');
        other.querySelector('.faq-answer').style.maxHeight = null;
        other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });
      item.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      const answer = item.querySelector('.faq-answer');
      answer.style.maxHeight = open ? answer.scrollHeight + 'px' : null;
    });
  });
}

// ════════ Course modal (name + phone; course sent automatically) ════════
let modalCourse = null;
let modalReturnFocus = null;
function openCourseModal(course, event) {
  modalCourse = course;
  modalReturnFocus = document.activeElement;
  const modal = document.getElementById('courseModal');
  const card = document.getElementById('courseModalCard');
  document.getElementById('cmCourseName').textContent = COURSE_NAMES[course] || '';
  document.getElementById('cmFormWrap').hidden = false;
  document.getElementById('cmSuccess').hidden = true;
  const form = document.getElementById('courseForm');
  form.querySelectorAll('.field').forEach(f => f.classList.remove('invalid'));

  // Grow from the button that was clicked
  modal.classList.add('open');
  if (event && event.clientX && !reduceMotion && window.innerWidth > 767) {
    const r = card.getBoundingClientRect();
    card.style.transformOrigin = `${event.clientX - r.left}px ${event.clientY - r.top}px`;
  } else {
    card.style.transformOrigin = '50% 100%';
  }
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('cmName').focus(), 60);
}
function closeCourseModal() {
  document.getElementById('courseModal').classList.remove('open');
  document.body.style.overflow = '';
  if (modalReturnFocus) modalReturnFocus.focus();
}
function initCourseModal() {
  document.querySelectorAll('[data-enroll]').forEach(b => b.addEventListener('click', e => openCourseModal(b.dataset.enroll, e)));
  document.querySelectorAll('#courseModal [data-close]').forEach(el => el.addEventListener('click', closeCourseModal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('courseModal').classList.contains('open')) closeCourseModal();
  });

  const form = document.getElementById('courseForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('cmName').value.trim();
    const phone = document.getElementById('cmPhone').value.trim();
    let ok = setInvalid(form, 'name', !name);
    ok = setInvalid(form, 'phone', !phoneIsComplete(phone)) && ok;
    if (!ok) { form.querySelector('.invalid .input').focus(); return; }
    const sent = await sendLead({ full_name: name, phone, course: modalCourse, source: 'course_card' }, form.querySelector('[type=submit]'));
    if (!sent) return;
    form.reset();
    document.getElementById('cmFormWrap').hidden = true;
    const success = document.getElementById('cmSuccess');
    success.hidden = false;
    success.focus();
  });
}

// ════════ Apply form (bottom yellow block) ════════
function initApplyForm() {
  const form = document.getElementById('applyForm');
  const success = document.getElementById('applySuccess');
  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => { const f = el.closest('.field'); if (f) f.classList.remove('invalid'); });
    el.addEventListener('change', () => { const f = el.closest('.field'); if (f) f.classList.remove('invalid'); });
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const course = form.course.value;
    let ok = setInvalid(form, 'name', !name);
    ok = setInvalid(form, 'phone', !phoneIsComplete(phone)) && ok;
    ok = setInvalid(form, 'course', !course) && ok;
    if (!ok) {
      const first = form.querySelector('.field.invalid');
      (first.querySelector('.input, input') || first).focus();
      return;
    }
    const sent = await sendLead({
      full_name: name, phone, course, source: 'apply_form',
      comment: form.comment.value.trim()
    }, form.querySelector('[type=submit]'));
    if (!sent) return;
    form.reset();
    form.hidden = true;
    success.hidden = false;
    success.focus();
  });
  document.getElementById('applyAgain').addEventListener('click', () => {
    success.hidden = true;
    form.hidden = false;
    form.name.focus();
  });
}

// ════════ Results marquee (hidden when there are none) ════════
let results = [];
async function loadResults() {
  const { data, error } = await apiRequest('GET', 'results/');
  results = (!error && Array.isArray(data)) ? data : [];
  renderResults();
}
function resultCard(r, hidden) {
  const band = v => Number(v).toFixed(1);
  const name = `${r.first_name}${r.last_name_initial ? ' ' + r.last_name_initial + '.' : ''}`;
  return `
    <article class="r-card${r.image_url ? ' has-photo' : ''}"${hidden ? ' aria-hidden="true"' : ''}>
      ${r.image_url ? `<img src="${escapeHtml(r.image_url)}" alt="${hidden ? '' : escapeHtml('IELTS — ' + name)}" loading="lazy"/>` : ''}
      <div class="r-top"><div class="r-overall">${band(r.overall)}</div><div class="r-label">Overall</div></div>
      <div class="r-bottom">
        <div class="r-bands">
          <span>L<b>${band(r.listening)}</b></span><span>R<b>${band(r.reading)}</b></span><span>W<b>${band(r.writing)}</b></span><span>S<b>${band(r.speaking)}</b></span>
        </div>
        <div class="r-name">${escapeHtml(name)}</div>
        <div class="r-course">${escapeHtml(COURSE_NAMES[r.course] || r.course)}</div>
      </div>
    </article>`;
}
function renderResults() {
  const section = document.getElementById('results');
  const show = results.length > 0;
  section.hidden = !show;
  document.querySelectorAll('[data-needs="results"]').forEach(el => { el.hidden = !show; });
  if (!show) return;

  const track = document.getElementById('resultsTrack');
  // Repeat the set until it is wider than the screen, then add one hidden copy for a seamless loop.
  const cardWidth = window.innerWidth <= 767 ? 182 : 210;
  const times = Math.max(1, Math.ceil((window.innerWidth * 1.1) / (results.length * cardWidth)));
  let set = '';
  for (let i = 0; i < times; i++) set += results.map(r => resultCard(r, i > 0)).join('');
  const copy = results.map(r => resultCard(r, true)).join('').repeat(times);
  track.innerHTML = set + copy;
  // About 45 px per second, but never faster than one loop in 25 s
  const seconds = Math.max(25, (results.length * times * cardWidth) / 45);
  track.style.setProperty('--marquee-duration', seconds + 's');
}
function initMarqueeTouch() {
  const m = document.getElementById('resultsMarquee');
  let timer = null;
  m.addEventListener('touchstart', () => { clearTimeout(timer); m.classList.add('paused'); }, { passive: true });
  m.addEventListener('touchend', () => { timer = setTimeout(() => m.classList.remove('paused'), 1500); }, { passive: true });
}

// ════════ Teachers (hidden when none are published) ════════
let teachers = [];
async function loadTeachers() {
  const { data, error } = await apiRequest('GET', 'teachers/');
  teachers = (!error && Array.isArray(data)) ? data : [];
  renderTeachers();
}
function renderTeachers() {
  const section = document.getElementById('instructors');
  const show = teachers.length > 0;
  section.hidden = !show;
  document.querySelectorAll('[data-needs="teachers"]').forEach(el => { el.hidden = !show; });
  if (!show) return;
  document.getElementById('teamGrid').innerHTML = teachers.map(tc => {
    const initials = tc.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const chips = [];
    if (tc.ielts_band !== null && tc.ielts_band !== undefined) chips.push(`<span class="chip ink">IELTS ${Number(tc.ielts_band).toFixed(1)}</span>`);
    if (tc.experience_years) chips.push(`<span class="chip">${escapeHtml(t('team-exp', { n: tc.experience_years, yrs: I18N.yearsWord(tc.experience_years) }))}</span>`);
    (tc.tags || []).forEach(tag => chips.push(`<span class="chip">${escapeHtml(tag)}</span>`));
    return `
      <article class="team-card">
        <div class="team-photo">${tc.image_url ? `<img src="${escapeHtml(tc.image_url)}" alt="${escapeHtml(tc.name)}" loading="lazy"/>` : `<span class="team-initials" aria-hidden="true">${escapeHtml(initials)}</span>`}</div>
        <h3 class="team-name">${escapeHtml(tc.name)}</h3>
        ${tc.role ? `<p class="team-role">${escapeHtml(tc.role)}</p>` : ''}
        <div class="chips">${chips.join('')}</div>
      </article>`;
  }).join('');
}

// ════════ News, events, speaking clubs (hidden when nothing is published) ════════
let newsPosts = [];
async function loadNews() {
  const { data, error } = await apiRequest('GET', 'news/');
  newsPosts = (!error && Array.isArray(data)) ? data : [];
  renderNews();
}
function renderNews() {
  const section = document.getElementById('news');
  const show = newsPosts.length > 0;
  section.hidden = !show;
  document.querySelectorAll('[data-needs="news"]').forEach(el => { el.hidden = !show; });
  if (!show) return;
  const grid = document.getElementById('newsGrid');
  grid.innerHTML = newsPosts.map(n => {
    const when = n.event_date ? new Date(n.event_date) : null;
    const dateBadge = when
      ? `<div class="news-date"><b>${I18N.tashkentParts(when).d}</b><small>${escapeHtml(I18N.formatMonthShort(when))}</small></div>` : '';
    const photo = n.image_url || when
      ? `<div class="news-photo${n.image_url ? '' : ' no-img'}">${n.image_url ? `<img src="${escapeHtml(n.image_url)}" alt="" loading="lazy"/>` : ''}${dateBadge}</div>` : '';
    const meta = [];
    if (n.kind && n.kind !== 'news') meta.push(`<span class="news-kind">${escapeHtml(t('news-kind-' + n.kind))}</span>`);
    if (when) meta.push(`<span>${escapeHtml(I18N.formatWeekday(when))}, ${escapeHtml(I18N.formatTime(when))}</span>`);
    if (n.location) meta.push(`<span>${escapeHtml(n.location)}</span>`);
    if (!when && n.created_at) meta.push(`<span>${escapeHtml(I18N.formatDay(new Date(n.created_at), true))}</span>`);
    return `
      <article class="news-card">
        ${photo}
        <div class="news-body">
          <div class="news-meta">${meta.join('')}</div>
          <h3>${escapeHtml(n.title)}</h3>
          ${n.body ? `<p class="news-text">${escapeHtml(n.body)}</p>` : ''}
        </div>
      </article>`;
  }).join('');
  // «Read more» only where the text is really cut off
  grid.querySelectorAll('.news-card').forEach(card => {
    const text = card.querySelector('.news-text');
    if (!text || text.scrollHeight <= text.clientHeight + 1) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'news-more';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = t('news-more');
    btn.addEventListener('click', () => {
      const open = card.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = t(open ? 'news-less' : 'news-more');
    });
    card.querySelector('.news-body').appendChild(btn);
  });
}

// ════════ Start ════════
document.addEventListener('DOMContentLoaded', () => {
  I18N.init();
  initHeader();
  initFaq();
  initCourseModal();
  initApplyForm();
  initMarqueeTouch();
  document.querySelectorAll('[data-phone]').forEach(attachUzPhoneMask);

  // Parts built in JS are redrawn in the new language
  I18N.onChange(() => {
    renderTeachers();
    renderNews();
    document.querySelectorAll('.faq-item.open .faq-answer').forEach(a => { a.style.maxHeight = a.scrollHeight + 'px'; });
  });

  loadResults();
  loadTeachers();
  loadNews();

  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWidth) > 80) { lastWidth = window.innerWidth; renderResults(); }
  }, { passive: true });
});
