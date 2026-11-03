// ============================================================
// Language switching shared by index.html and mock.html.
// Texts live in translations.js (window.TRANSLATIONS).
// Languages: ru (default), kaa (Qaraqalpaqsha, Latin), en.
// The choice is remembered in localStorage and can be forced with ?lang=kaa.
// ============================================================
(function () {
  const LANGS = ['ru', 'kaa', 'en'];
  const STORAGE_KEY = 'stanford-lang';
  const TZ = 'Asia/Tashkent';
  const listeners = [];

  function dict(lang) { return (window.TRANSLATIONS && window.TRANSLATIONS[lang]) || {}; }

  function currentLang() {
    const l = document.documentElement.lang;
    return LANGS.includes(l) ? l : 'ru';
  }

  // t('mock-seats', { n: 3, max: 20 }) fills {n} and {max}
  function t(key, vars) {
    let s = dict(currentLang())[key];
    if (s === undefined) s = dict('ru')[key];
    if (s === undefined) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const v = dict(currentLang())[el.getAttribute('data-i18n')];
      if (v !== undefined) el.innerHTML = v; // our own texts (may contain <sub>, <br>)
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const v = dict(currentLang())[el.getAttribute('data-i18n-placeholder')];
      if (v !== undefined) el.setAttribute('placeholder', v);
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const v = dict(currentLang())[el.getAttribute('data-i18n-aria')];
      if (v !== undefined) el.setAttribute('aria-label', v);
    });
  }

  function setLanguage(lang) {
    if (!LANGS.includes(lang)) lang = 'ru';
    document.documentElement.lang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode: just don't remember */ }
    apply();
    document.querySelectorAll('.lang-switch [data-lang]').forEach(b => {
      const on = b.dataset.lang === lang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const titleKey = document.body && document.body.dataset.titleKey;
    if (titleKey) document.title = t(titleKey);
    listeners.forEach(fn => { try { fn(lang); } catch (e) { console.warn(e); } });
  }

  function initialLang() {
    try {
      const fromUrl = new URLSearchParams(location.search).get('lang');
      if (LANGS.includes(fromUrl)) return fromUrl;
    } catch (e) { /* ignore */ }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (LANGS.includes(saved)) return saved;
    } catch (e) { /* ignore */ }
    return 'ru';
  }

  // ── Dates, always in Tashkent time ──
  // Parts of a date as seen in Tashkent: { y, m (1–12), d, hh, mm, wd (0 = Monday) }
  function tashkentParts(date) {
    const parts = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
    }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
    const wdIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
    return { y: +parts.year, m: +parts.month, d: +parts.day, hh: parts.hour, mm: parts.minute, wd: wdIndex };
  }

  function localeFor(lang) { return lang === 'en' ? 'en-GB' : 'ru-RU'; }

  // "14 ноября", "14-noyabr", "14 November" (+ year if asked)
  function formatDay(date, withYear) {
    const lang = currentLang();
    if (lang === 'kaa') {
      const p = tashkentParts(date);
      return `${p.d}-${window.KAA_CALENDAR.months[p.m - 1]}` + (withYear ? ` ${p.y}` : '');
    }
    const opts = { timeZone: TZ, day: 'numeric', month: 'long' };
    if (withYear) opts.year = 'numeric';
    return date.toLocaleDateString(localeFor(lang), opts).replace(/\s?г\.$/, '');
  }

  function formatWeekday(date) {
    const lang = currentLang();
    if (lang === 'kaa') return window.KAA_CALENDAR.weekdays[tashkentParts(date).wd];
    return date.toLocaleDateString(localeFor(lang), { timeZone: TZ, weekday: 'long' });
  }

  function formatTime(date) {
    const p = tashkentParts(date);
    return `${p.hh}:${p.mm}`;
  }

  function formatMonthShort(date) {
    const lang = currentLang();
    if (lang === 'kaa') return window.KAA_CALENDAR.months[tashkentParts(date).m - 1].slice(0, 3);
    return date.toLocaleDateString(localeFor(lang), { timeZone: TZ, month: 'short' }).replace('.', '');
  }

  function formatPrice(uzs) {
    if (uzs === null || uzs === undefined) return '—';
    const n = Number(uzs).toLocaleString(currentLang() === 'en' ? 'en-US' : 'ru-RU');
    return `${n} ${t('currency')}`;
  }

  // Russian plural for "год / года / лет"
  function yearsWord(n) {
    const lang = currentLang();
    if (lang === 'kaa') return t('yr-many');
    if (lang === 'en') return n === 1 ? t('yr-one') : t('yr-many');
    const rule = new Intl.PluralRules('ru-RU').select(n);
    return t(rule === 'one' ? 'yr-one' : rule === 'few' ? 'yr-few' : 'yr-many');
  }

  // ── Wire the RU · QQ · EN switcher(s) ──
  function init() {
    document.querySelectorAll('.lang-switch [data-lang]').forEach(b => {
      b.addEventListener('click', () => setLanguage(b.dataset.lang));
    });
    setLanguage(initialLang());
  }

  window.I18N = {
    t, apply, setLanguage, currentLang, init, tashkentParts, formatDay, formatWeekday,
    formatTime, formatMonthShort, formatPrice, yearsWord,
    onChange(fn) { listeners.push(fn); }
  };
  window.setLanguage = setLanguage;
})();
