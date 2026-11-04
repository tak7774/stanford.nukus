/* Student / teacher portal (portal.html). Talks to /api/portal/* (Django, backend/portal).
 * Every piece of text that comes from the server is put on the page with textContent
 * (through h()), never innerHTML, so nobody can inject markup through a name or an essay. */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var TZ = 'Asia/Tashkent';
  var state = { me: null };

  // ── Small helpers ────────────────────────────────────────
  function h(tag, props) {
    var el = document.createElement(tag);
    var p = props || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v === false || v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }

  function csrf() {
    var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function api(method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-CSRFToken'] = csrf();
      opts.body = JSON.stringify(body || {});
    }
    return fetch('/api/portal/' + url, opts).then(function (r) {
      return r.text().then(function (t) {
        var data = {};
        try { data = t ? JSON.parse(t) : {}; } catch (e) { /* not JSON */ }
        return { ok: r.ok, status: r.status, data: data };
      });
    }).catch(function () {
      return { ok: false, status: 0, data: { detail: 'Нет связи с сервером. Проверьте интернет и повторите.' } };
    });
  }

  function firstError(res) {
    var d = res.data || {};
    if (d.detail) return d.detail;
    if (d.errors) {
      var k = Object.keys(d.errors)[0];
      var v = d.errors[k];
      return Array.isArray(v) ? v[0] : String(v);
    }
    return res.status === 429 ? 'Слишком много попыток. Подождите немного.' : 'Что-то пошло не так. Повторите позже.';
  }

  var toastTimer;
  function toast(text, bad) {
    var t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(t); }
    t.textContent = text;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 4000);
  }

  function fmtDate(iso, opts) { return new Date(iso).toLocaleDateString('ru-RU', Object.assign({ timeZone: TZ }, opts)); }
  function fmtTime(iso) { return new Date(iso).toLocaleTimeString('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }); }
  function fmtWhen(iso) { return fmtDate(iso, { weekday: 'long' }) + ', ' + fmtTime(iso); }
  function todayKey() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }   // YYYY-MM-DD
  function daysUntil(dateStr) {
    return Math.round((Date.parse(dateStr + 'T00:00:00Z') - Date.parse(todayKey() + 'T00:00:00Z')) / 86400000);
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }
  function firstName(full) { return (full || '').split(' ')[0]; }
  function initials(full) {
    return (full || '?').split(' ').filter(Boolean).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('');
  }

  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function home() { return state.me && state.me.role === 'teacher' ? '#teacher' : '#student'; }

  // ── Shared pieces ────────────────────────────────────────
  function field(id, label, input, error) {
    return h('div', { class: 'field' },
      h('label', { for: id, text: label }), input,
      error ? h('div', { class: 'err', id: id + '-err', role: 'alert', text: error }) : null);
  }
  function input(id, type, ph, extra) {
    return h('input', Object.assign({ id: id, name: id, type: type, placeholder: ph || '' }, extra || {}));
  }
  function bar(active) {
    var me = state.me;
    var nav = h('nav', { 'aria-label': 'Кабинет' },
      h('a', { href: home(), 'aria-current': active === 'home' ? 'page' : false, text: 'Главная' }),
      h('a', { href: '#library', 'aria-current': active === 'library' ? 'page' : false, text: 'Библиотека' }));
    var out = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Выйти', onclick: function () {
      api('POST', 'logout/').then(function () { state.me = null; go('#login'); });
    } });
    return h('div', { class: 'pbar' }, nav,
      h('div', { class: 'who' }, h('span', { class: 'avatar' + (me.role === 'teacher' ? ' dark' : ''), 'aria-hidden': 'true', text: initials(me.full_name) }),
        h('span', { text: me.full_name }), out));
  }
  function empty(text) { return h('p', { class: 'empty muted', text: text }); }
  function loading() { app.replaceChildren(h('p', { class: 'muted', text: 'Загрузка…' })); }

  function authSide(title, bullets, linkText, linkHref, linkLabel) {
    return h('div', { class: 'side' },
      h('div', { style: 'font-weight:700;font-size:18px', text: 'Stanford' }),
      h('div', { class: 'stack gap-4' }, h('h1', { text: title }), h('ul', null, bullets.map(function (b) { return h('li', { text: b }); }))),
      h('div', null, linkText + ' ', h('a', { href: linkHref, text: linkLabel })));
  }
  var BULLETS = ['Материалы и расписание вашего курса', 'Домашние задания со сроками и оценками', 'Библиотека учебников и книг для чтения'];

  // ── Login ────────────────────────────────────────────────
  function renderLogin() {
    var err = h('div', { class: 'err', role: 'alert' });
    var email = input('email', 'email', 'name@example.com', { autocomplete: 'email', required: true });
    var pass = input('pass', 'password', 'Ваш пароль', { autocomplete: 'current-password', required: true });
    var btn = h('button', { type: 'submit', class: 'btn btn-yellow btn-lg', text: 'Войти' });
    var form = h('form', { novalidate: true, onsubmit: function (e) {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      api('POST', 'login/', { email: email.value, password: pass.value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = firstError(res); return; }
        state.me = res.data; go(home());
      });
    } },
      h('div', { class: 'stack', style: 'gap:6px' }, h('h2', { style: 'font-size:28px', text: 'Вход в кабинет' }), h('p', { class: 'muted', text: 'Для студентов и преподавателей Stanford.' })),
      field('email', 'Электронная почта', email), field('pass', 'Пароль', pass), err, btn);
    app.replaceChildren(h('div', { class: 'signup' }, authSide('Курсы, задания и книги в одном кабинете', BULLETS, 'Нет аккаунта?', '#register', 'Создать'), form));
    email.focus();
  }

  // ── Register ─────────────────────────────────────────────
  function renderRegister() {
    var role = 'student';
    var f = {
      name: input('name', 'text', 'Например, Айгерим Қасымова', { autocomplete: 'name', maxlength: 120 }),
      phone: input('phone', 'tel', '+998 __ ___ __ __', { autocomplete: 'tel', maxlength: 30 }),
      email: input('email', 'email', 'name@example.com', { autocomplete: 'email' }),
      pass: input('pass', 'password', 'Не короче 8 символов', { autocomplete: 'new-password', maxlength: 128 }),
      subject: input('subject', 'text', 'Например, IELTS Writing', { maxlength: 120 })
    };
    var course = h('select', { id: 'course' },
      ['IELTS Intensive', 'General English', 'Пока не записан(а)'].map(function (c) { return h('option', { text: c }); }));
    var courseBox = field('course', 'Ваш курс', course);
    var teacherBox = h('div', { class: 'stack gap-3', hidden: true },
      field('subject', 'Что вы преподаёте', f.subject),
      h('div', { class: 'notice', text: 'Аккаунт преподавателя включает администратор центра. Мы позвоним вам после заявки.' }));
    var bS = h('button', { type: 'button', 'aria-pressed': 'true', text: 'Я студент' });
    var bT = h('button', { type: 'button', 'aria-pressed': 'false', text: 'Я преподаватель' });
    var errs = {};
    var btn = h('button', { type: 'submit', class: 'btn btn-yellow btn-lg', text: 'Создать аккаунт' });
    var general = h('div', { class: 'err', role: 'alert' });
    function setRole(r) {
      role = r;
      bS.setAttribute('aria-pressed', r === 'student'); bT.setAttribute('aria-pressed', r === 'teacher');
      courseBox.hidden = r !== 'student'; teacherBox.hidden = r !== 'teacher';
      btn.textContent = r === 'student' ? 'Создать аккаунт' : 'Отправить заявку';
    }
    bS.addEventListener('click', function () { setRole('student'); });
    bT.addEventListener('click', function () { setRole('teacher'); });
    function wrap(key, id, label, el) {
      var box = field(id, label, el); var e = h('div', { class: 'err', role: 'alert' }); box.appendChild(e); errs[key] = e; return box;
    }
    var form = h('form', { novalidate: true, onsubmit: function (e) {
      e.preventDefault(); general.textContent = '';
      Object.keys(errs).forEach(function (k) { errs[k].textContent = ''; });
      btn.disabled = true;
      api('POST', 'register/', {
        role: role, full_name: f.name.value, phone: f.phone.value, email: f.email.value, password: f.pass.value,
        note: role === 'student' ? course.value : f.subject.value
      }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) {
          var shown = false;
          var map = { full_name: 'name', phone: 'phone', email: 'email', password: 'pass' };
          Object.keys((res.data && res.data.errors) || {}).forEach(function (k) {
            var v = res.data.errors[k];
            var target = errs[map[k]];
            if (target) { target.textContent = Array.isArray(v) ? v[0] : String(v); shown = true; }
          });
          if (!shown) general.textContent = firstError(res);
          return;
        }
        if (res.data.pending) { renderPending(res.data.detail); return; }
        state.me = res.data; go('#student');
      });
    } },
      h('div', { class: 'stack', style: 'gap:6px' }, h('h2', { style: 'font-size:28px', text: 'Создать аккаунт' }), h('p', { class: 'muted', text: 'Выберите, кто вы, и заполните данные.' })),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Роль' }, bS, bT),
      wrap('name', 'name', 'Имя и фамилия', f.name), wrap('phone', 'phone', 'Телефон', f.phone), wrap('email', 'email', 'Электронная почта', f.email),
      courseBox, teacherBox, wrap('pass', 'pass', 'Пароль', f.pass), general, btn);
    app.replaceChildren(h('div', { class: 'signup' }, authSide('Курсы, задания и книги в одном кабинете', BULLETS, 'Уже есть аккаунт?', '#login', 'Войти'), form));
    f.name.focus();
  }

  function renderPending(text) {
    app.replaceChildren(h('div', { class: 'card stack gap-3', style: 'max-width:560px;margin:40px auto' },
      h('h1', { class: 'page', text: 'Заявка отправлена' }), h('p', { text: text }),
      h('a', { href: '#login', class: 'btn btn-ink', style: 'align-self:flex-start', text: 'К входу' })));
  }

  // ── Student ──────────────────────────────────────────────
  function taskChip(t) {
    if (t.state === 'reviewed') return h('span', { class: 'chip done', text: 'Проверено: ' + t.grade });
    if (t.state === 'submitted') return h('span', { class: 'chip wait', text: 'На проверке' });
    var d = daysUntil(t.due_date);
    if (d < 0) return h('span', { class: 'chip late', text: 'Просрочено' });
    if (d === 0) return h('span', { class: 'chip soon', text: 'Срок сегодня' });
    return h('span', { class: 'chip soon', text: 'Осталось ' + d + ' ' + plural(d, 'день', 'дня', 'дней') });
  }

  function taskRow(t, reload) {
    var panel = h('div', { class: 'panel', hidden: true });
    var open = false;
    function fill() {
      panel.replaceChildren();
      if (t.instructions) panel.appendChild(h('p', { class: 'pre', text: t.instructions }));
      if (t.state === 'reviewed') {
        panel.appendChild(h('p', null, h('b', { text: 'Ваш ответ: ' }), h('span', { class: 'pre', text: t.text })));
        if (t.feedback) panel.appendChild(h('p', null, h('b', { text: 'Комментарий преподавателя: ' }), h('span', { class: 'pre', text: t.feedback })));
        return;
      }
      var ta = h('textarea', { id: 'ans-' + t.id, rows: 5, maxlength: 10000, 'aria-label': 'Ваш ответ', placeholder: 'Напишите ответ здесь', text: t.text });
      var err = h('div', { class: 'err', role: 'alert' });
      var btn = h('button', { type: 'button', class: 'btn btn-yellow btn-sm', text: t.state === 'submitted' ? 'Отправить заново' : 'Сдать работу', onclick: function () {
        err.textContent = ''; btn.disabled = true;
        api('POST', 'student/assignments/' + t.id + '/submit/', { text: ta.value }).then(function (res) {
          btn.disabled = false;
          if (!res.ok) { err.textContent = firstError(res); return; }
          toast('Работа отправлена на проверку'); reload();
        });
      } });
      panel.appendChild(ta); panel.appendChild(err); panel.appendChild(btn);
    }
    var toggle = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false', text: t.state === 'todo' ? 'Открыть' : 'Подробнее', onclick: function () {
      open = !open; panel.hidden = !open; toggle.setAttribute('aria-expanded', open);
      if (open) fill();
    } });
    return h('div', { class: 'row wrap-row' },
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:600', text: t.title }), h('div', { class: 'muted small', text: t.group })),
      h('div', { class: 'muted small', text: 'до ' + fmtDate(t.due_date + 'T12:00:00Z', { day: 'numeric', month: 'long' }) }),
      taskChip(t), toggle, panel);
  }

  function bookCover(i) { return 'cover c' + ((i % 4) + 1); }

  function renderStudent() {
    loading();
    api('GET', 'student/').then(function (res) {
      if (!res.ok) { return authFail(res); }
      var d = res.data;
      var open = d.tasks.filter(function (t) { return t.state === 'todo'; });
      var sub = open.length
        ? 'Сегодня ' + fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' }) + '. Заданий к сдаче: ' + open.length + '.'
        : 'Сегодня ' + fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' }) + '. Все задания сданы.';
      var courses = d.groups.length ? d.groups.map(function (g) {
        var pct = g.lessons_total ? Math.min(100, Math.round(g.lessons_done * 100 / g.lessons_total)) : 0;
        return h('div', { class: 'card stack gap-3' },
          h('div', null, h('div', { style: 'font-size:18px;font-weight:700', text: g.title }), g.teacher ? h('div', { class: 'muted', text: 'Преподаватель: ' + g.teacher }) : null),
          h('div', { class: 'stack', style: 'gap:6px' },
            h('div', { class: 'bar', role: 'img', 'aria-label': 'Пройдено ' + pct + '%' }, h('i', { style: 'width:' + pct + '%' })),
            h('div', { class: 'muted small', text: g.lessons_done + ' из ' + g.lessons_total + ' уроков' })),
          g.next_lesson ? h('div', { class: 'small' }, 'Следующее занятие: ', h('b', { text: fmtWhen(g.next_lesson) })) : h('div', { class: 'small muted', text: 'Расписание пока не добавлено' }));
      }) : [h('div', { class: 'card' }, empty('Вы пока не в группе. Администратор центра добавит вас в группу после записи на курс.'))];
      var tasks = d.tasks.length ? d.tasks.map(function (t) { return taskRow(t, renderStudent); }) : [empty('Заданий пока нет. Когда преподаватель опубликует задание, оно появится здесь.')];
      var week = d.week.length ? d.week.map(function (l) {
        return h('div', { class: 'row nowrap' }, h('div', { class: 'day', text: fmtDate(l.starts_at, { weekday: 'long' }) }),
          h('div', null, h('div', { style: 'font-weight:500', text: l.group }), h('div', { class: 'muted small', text: fmtTime(l.starts_at) + '–' + fmtTime(l.ends_at) })));
      }) : [empty('На ближайшие 7 дней занятий нет.')];
      var books = d.books.length ? h('div', { class: 'books' }, d.books.map(function (b, i) {
        return h('a', { class: bookCover(i), href: b.url, target: '_blank', rel: 'noopener noreferrer', text: b.title });
      })) : empty('Преподаватели ещё не добавили книги.');
      app.replaceChildren(bar('home'), h('div', { class: 'stack gap-5' },
        h('div', { class: 'stack', style: 'gap:4px' }, h('h1', { class: 'page', text: 'Здравствуйте, ' + firstName(d.full_name) }), h('p', { class: 'muted', text: sub })),
        h('div', { class: 'cols' },
          h('div', { class: 'main stack gap-5' },
            h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Мои курсы' }), h('div', { class: 'grid' }, courses)),
            h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Задания' }), h('div', { class: 'card list' }, tasks))),
          h('aside', { class: 'stack gap-5' },
            h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Расписание на неделю' }), h('div', { class: 'card list' }, week)),
            h('section', { class: 'stack gap-3' },
              h('div', { class: 'between' }, h('h2', { class: 'sec', text: 'Книги вашего курса' }), h('a', { href: '#library', style: 'font-weight:600', text: 'Вся библиотека' })),
              books)))));
    });
  }

  // ── Teacher ──────────────────────────────────────────────
  function reviewRow(q, reload) {
    var panel = h('div', { class: 'panel', hidden: true });
    var open = false;
    function fill() {
      var grade = h('input', { id: 'g-' + q.id, type: 'text', maxlength: 20, placeholder: 'Например, 7.0', 'aria-label': 'Оценка' });
      var fb = h('textarea', { id: 'f-' + q.id, rows: 3, maxlength: 5000, 'aria-label': 'Комментарий', placeholder: 'Комментарий студенту (необязательно)' });
      var err = h('div', { class: 'err', role: 'alert' });
      var btn = h('button', { type: 'button', class: 'btn btn-yellow btn-sm', text: 'Сохранить оценку', onclick: function () {
        err.textContent = ''; btn.disabled = true;
        api('POST', 'teacher/submissions/' + q.id + '/review/', { grade: grade.value, feedback: fb.value }).then(function (res) {
          btn.disabled = false;
          if (!res.ok) { err.textContent = firstError(res); return; }
          toast('Оценка сохранена'); reload();
        });
      } });
      panel.replaceChildren(
        q.instructions ? h('p', null, h('b', { text: 'Задание: ' }), h('span', { class: 'pre', text: q.instructions })) : null,
        h('p', null, h('b', { text: 'Ответ студента:' })), h('p', { class: 'pre answer', text: q.text }),
        field('g-' + q.id, 'Оценка', grade), field('f-' + q.id, 'Комментарий', fb), err, btn);
    }
    var toggle = h('button', { type: 'button', class: 'btn btn-ink btn-sm', 'aria-expanded': 'false', text: 'Проверить', onclick: function () {
      open = !open; panel.hidden = !open; toggle.setAttribute('aria-expanded', open); if (open) fill();
    } });
    return h('div', { class: 'row wrap-row' },
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:600', text: q.student }), h('div', { class: 'muted small', text: q.task + ' · ' + q.group })),
      h('div', { class: 'muted small', text: 'сдано ' + fmtDate(q.submitted_at, { day: 'numeric', month: 'long' }) }), toggle, panel);
  }

  function renderTeacher() {
    loading();
    api('GET', 'teacher/').then(function (res) {
      if (!res.ok) { return authFail(res); }
      var d = res.data, n = d.queue.length;
      var title = n ? 'На проверке ' + n + ' ' + plural(n, 'работа', 'работы', 'работ') : 'Работ на проверку нет';
      var sub = n ? 'Самая старая сдана ' + fmtDate(d.queue[0].submitted_at, { day: 'numeric', month: 'long' }) + '. Начните с неё.' : 'Когда студенты сдадут работы, они появятся здесь.';
      var queue = n ? d.queue.map(function (q) { return reviewRow(q, renderTeacher); }) : [empty('Все работы проверены.')];

      var groups = d.groups.length ? d.groups.map(function (g) {
        var list = h('div', { class: 'panel', hidden: true });
        var btn = h('button', { type: 'button', class: 'btn btn-ink btn-sm', 'aria-expanded': 'false', text: 'Список студентов', onclick: function () {
          var show = list.hidden; list.hidden = !show; btn.setAttribute('aria-expanded', show);
          if (!show) return;
          list.replaceChildren(h('span', { class: 'muted', text: 'Загрузка…' }));
          api('GET', 'teacher/groups/' + g.id + '/students/').then(function (r) {
            if (!r.ok) { list.replaceChildren(h('span', { class: 'err', text: firstError(r) })); return; }
            list.replaceChildren(r.data.students.length
              ? h('ul', { class: 'plain' }, r.data.students.map(function (s) { return h('li', null, h('b', { text: s.name }), ' · ' + s.phone); }))
              : h('span', { class: 'muted', text: 'В группе пока нет студентов.' }));
          });
        } });
        return h('div', { class: 'card stack gap-3' },
          h('div', null, h('div', { style: 'font-size:18px;font-weight:700', text: g.title }),
            h('div', { class: 'muted', text: g.students + ' ' + plural(g.students, 'студент', 'студента', 'студентов') })),
          g.next_lesson ? h('div', { class: 'small' }, 'Ближайшее занятие: ', h('b', { text: fmtWhen(g.next_lesson) })) : h('div', { class: 'small muted', text: 'Расписание пока не добавлено' }),
          h('div', { class: 'filters' }, btn, h('a', { href: '#library', class: 'btn btn-ghost btn-sm', text: 'Материалы' })), list);
      }) : [h('div', { class: 'card' }, empty('За вами пока не закреплена ни одна группа. Администратор центра добавит группы.'))];

      app.replaceChildren(bar('home'), h('div', { class: 'stack gap-5' },
        h('div', { class: 'stack', style: 'gap:4px' }, h('h1', { class: 'page', text: title }), h('p', { class: 'muted', text: sub })),
        h('div', { class: 'cols' },
          h('div', { class: 'main stack gap-5' },
            h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Работы на проверку' }), h('div', { class: 'card list' }, queue)),
            h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Мои группы' }), h('div', { class: 'grid' }, groups))),
          h('aside', { class: 'stack gap-5' },
            h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Новое задание' }), assignmentForm(d.groups)),
            h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Книги и файлы' }),
              h('div', { class: 'card stack gap-3' },
                h('p', { class: 'muted', text: 'Добавьте ссылку на PDF, аудио или сайт. Студенты вашей группы увидят её в библиотеке.' }),
                h('a', { href: '#library', class: 'btn btn-ghost', text: 'Добавить в библиотеке' })))))));
    });
  }

  function assignmentForm(groups) {
    if (!groups.length) return h('div', { class: 'card' }, empty('Задание можно создать, когда у вас появится группа.'));
    var title = h('input', { id: 't-title', type: 'text', maxlength: 160, placeholder: 'Например, Writing Task 1' });
    var group = h('select', { id: 't-group' }, groups.map(function (g) { return h('option', { value: g.id, text: g.title }); }));
    var due = h('input', { id: 't-due', type: 'date', min: todayKey() });
    var text = h('textarea', { id: 't-text', rows: 3, maxlength: 5000 });
    var err = h('div', { class: 'err', role: 'alert' });
    var btn = h('button', { type: 'submit', class: 'btn btn-yellow btn-lg', text: 'Опубликовать задание' });
    return h('form', { class: 'card stack gap-3', novalidate: true, onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      if (!title.value.trim() || !due.value) { err.textContent = 'Укажите название и срок сдачи.'; return; }
      btn.disabled = true;
      api('POST', 'teacher/assignments/', { group: Number(group.value), title: title.value, due_date: due.value, instructions: text.value }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) { err.textContent = firstError(res); return; }
        toast('Задание опубликовано'); title.value = ''; text.value = ''; due.value = '';
      });
    } }, field('t-title', 'Название', title), field('t-group', 'Группа', group), field('t-due', 'Срок сдачи', due),
      field('t-text', 'Что нужно сделать', text), err, btn);
  }

  // ── Library ──────────────────────────────────────────────
  var KIND = { pdf: 'PDF', audio: 'Аудио', link: 'Ссылка' };
  var ACTION = { pdf: 'Открыть', audio: 'Слушать', link: 'Открыть' };

  function renderLibrary() {
    loading();
    api('GET', 'library/').then(function (res) {
      if (!res.ok) { return authFail(res); }
      var d = res.data, filter = 'all', q = '';
      var grid = h('div', { class: 'grid', id: 'books' });
      var none = h('p', { class: 'muted', hidden: true, text: 'Ничего не найдено. Измените запрос или фильтр.' });
      var search = h('input', { id: 'q', type: 'search', placeholder: 'Найти книгу по названию', oninput: function () { q = search.value.trim().toLowerCase(); draw(); } });
      var filters = h('div', { class: 'filters chips' });
      var chips = [['all', 'Все']].concat(d.groups.map(function (g) { return [g.title, g.title]; })).concat([['Аудио', 'Аудио']]);
      chips.forEach(function (c) {
        var b = h('button', { type: 'button', 'aria-pressed': c[0] === 'all' ? 'true' : 'false', text: c[1], onclick: function () {
          filter = c[0]; [].forEach.call(filters.children, function (x) { x.setAttribute('aria-pressed', x === b); }); draw();
        } });
        filters.appendChild(b);
      });
      function draw() {
        var shown = d.books.filter(function (b) {
          var okF = filter === 'all' || b.group === filter || KIND[b.kind] === filter;
          return okF && (!q || b.title.toLowerCase().indexOf(q) >= 0);
        });
        grid.replaceChildren.apply(grid, shown.map(function (b, i) {
          var del = b.mine ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Удалить', onclick: function () {
            if (!confirm('Удалить «' + b.title + '» из библиотеки?')) return;
            api('DELETE', 'library/' + b.id + '/').then(function (r) { if (r.ok) { toast('Удалено'); renderLibrary(); } else toast(firstError(r), true); });
          } }) : null;
          return h('div', { class: 'card book' },
            h('span', { class: bookCover(i), 'aria-hidden': 'true', text: b.title }),
            h('div', { class: 'stack', style: 'justify-content:space-between;gap:12px;min-width:0' },
              h('div', null, h('div', { style: 'font-weight:700;overflow-wrap:anywhere', text: b.title }), h('div', { class: 'muted small', text: KIND[b.kind] || b.kind }), h('div', { class: 'muted small', text: b.group })),
              h('div', { class: 'filters' },
                h('a', { href: b.url, target: '_blank', rel: 'noopener noreferrer', class: 'btn btn-ink btn-sm', text: ACTION[b.kind] || 'Открыть' }), del)));
        }));
        none.hidden = shown.length > 0;
        if (!d.books.length) { none.hidden = false; none.textContent = d.role === 'teacher' ? 'В библиотеке пока пусто. Добавьте первую ссылку ниже.' : 'Преподаватели ещё не добавили книги для ваших курсов.'; }
      }
      draw();
      app.replaceChildren(bar('library'), h('div', { class: 'stack gap-4' },
        h('div', { class: 'stack', style: 'gap:4px' }, h('h1', { class: 'page', text: 'Библиотека' }),
          h('p', { class: 'muted', text: 'Учебники и материалы, которые открыли преподаватели для ваших курсов.' })),
        h('div', { class: 'toolbar' }, h('div', { style: 'flex:1 1 280px' }, h('label', { for: 'q', class: 'sr', text: 'Поиск по названию' }), search), filters),
        grid, none, d.role === 'teacher' ? bookForm(d.groups) : null));
    });
  }

  function bookForm(groups) {
    if (!groups.length) return null;
    var title = h('input', { id: 'b-title', type: 'text', maxlength: 160, placeholder: 'Например, Cambridge IELTS 18' });
    var url = h('input', { id: 'b-url', type: 'url', maxlength: 500, placeholder: 'https://…' });
    var kind = h('select', { id: 'b-kind' }, [['pdf', 'PDF'], ['audio', 'Аудио'], ['link', 'Ссылка']].map(function (k) { return h('option', { value: k[0], text: k[1] }); }));
    var group = h('select', { id: 'b-group' }, groups.map(function (g) { return h('option', { value: g.id, text: g.title }); }));
    var err = h('div', { class: 'err', role: 'alert' });
    var btn = h('button', { type: 'submit', class: 'btn btn-yellow btn-lg', text: 'Добавить в библиотеку' });
    return h('section', { class: 'stack gap-3' }, h('h2', { class: 'sec', text: 'Добавить книгу или файл' }),
      h('form', { class: 'card stack gap-3', style: 'max-width:560px', novalidate: true, onsubmit: function (e) {
        e.preventDefault(); err.textContent = '';
        btn.disabled = true;
        api('POST', 'library/', { group: Number(group.value), title: title.value, kind: kind.value, url: url.value }).then(function (res) {
          btn.disabled = false;
          if (!res.ok) { err.textContent = firstError(res); return; }
          toast('Добавлено в библиотеку'); renderLibrary();
        });
      } }, h('p', { class: 'muted small', text: 'Файлы не загружаются на сайт: вставьте ссылку (Google Drive, YouTube, сайт издательства).' }),
        field('b-title', 'Название', title), field('b-group', 'Группа', group), field('b-kind', 'Тип', kind), field('b-url', 'Ссылка', url), err, btn));
  }

  // ── Routing ──────────────────────────────────────────────
  function authFail(res) {
    if (res.status === 401 || res.status === 403) { state.me = null; go('#login'); return; }
    app.replaceChildren(h('div', { class: 'card stack gap-3' }, h('p', { class: 'err', text: firstError(res) }),
      h('button', { type: 'button', class: 'btn btn-ink', style: 'align-self:flex-start', text: 'Повторить', onclick: route })));
  }

  function route() {
    var page = location.hash.replace('#', '') || 'login';
    window.scrollTo(0, 0);
    var needMe = state.me ? Promise.resolve() : api('GET', 'me/').then(function (r) { state.me = r.ok && r.data.authenticated ? r.data : null; });
    needMe.then(function () {
      var signedIn = !!state.me;
      if (page === 'login' || page === 'register') { if (signedIn) return go(home()); return page === 'login' ? renderLogin() : renderRegister(); }
      if (!signedIn) return go('#login');
      if (page === 'student') return state.me.role === 'student' ? renderStudent() : go('#teacher');
      if (page === 'teacher') return state.me.role === 'teacher' ? renderTeacher() : go('#student');
      if (page === 'library') return renderLibrary();
      go(home());
    });
  }

  window.addEventListener('hashchange', route);
  route();
})();
