  // Navbar scroll state
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));

  // Mobile menu
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  hamburger.addEventListener('click', () => { hamburger.classList.toggle('open'); navLinks.classList.toggle('open'); });
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { hamburger.classList.remove('open'); navLinks.classList.remove('open'); }));

  // Scroll reveal
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.12 });
  reveals.forEach(el => observer.observe(el));

  // ─── Level quiz ─────────────────────────────────
  function quizGoto(stepId){
    document.querySelectorAll('.quiz-step').forEach(s => s.classList.remove('active'));
    document.getElementById(stepId).classList.add('active');
  }
  function quizAnswer(track){
    document.querySelectorAll('.quiz-step').forEach(s => s.classList.remove('active'));
    const map = { kids:'quizResultKids', general:'quizResultGeneral', ielts:'quizResultIelts', advanced:'quizResultAdvanced' };
    document.getElementById(map[track]).classList.add('active');
  }
  function quizReset(){
    document.querySelectorAll('.quiz-result').forEach(r => r.classList.remove('active'));
    quizGoto('quizStep1');
  }
  // ─── FAQ accordion ──────────────────────────────
  function toggleFaq(btn){
    const item = btn.closest('.faq-item');
    const answer = item.querySelector('.faq-answer');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(openItem => {
      if (openItem !== item){
        openItem.classList.remove('open');
        openItem.querySelector('.faq-answer').style.maxHeight = null;
      }
    });
    if (isOpen){
      item.classList.remove('open');
      answer.style.maxHeight = null;
    } else {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  }

  // ─── Trial lesson form: validation + mock submit (no backend — see note) ──
  const trialForm = document.getElementById('trialForm');
  trialForm.addEventListener('submit', function(e){
    e.preventDefault();
    let valid = true;

    const nameField = document.getElementById('trialFieldName');
    const nameInput = document.getElementById('trialName');
    if (!nameInput.value.trim()){ nameField.classList.add('invalid'); valid = false; }
    else nameField.classList.remove('invalid');

    const phoneField = document.getElementById('trialFieldPhone');
    const phoneInput = document.getElementById('trialPhone');
    const phoneDigits = phoneInput.value.replace(/\D/g, '');
    if (phoneDigits.length < 9){ phoneField.classList.add('invalid'); valid = false; }
    else phoneField.classList.remove('invalid');

    const courseField = document.getElementById('trialFieldCourse');
    const courseInput = document.getElementById('trialCourse');
    if (!courseInput.value){ courseField.classList.add('invalid'); valid = false; }
    else courseField.classList.remove('invalid');

    if (!valid) return;

    // NOTE: This form has no backend. To actually receive these applications,
    // connect this submit handler to a Telegram Bot API call, an email service
    // (e.g. Formspree, EmailJS), or your own server endpoint.
    trialForm.style.display = 'none';
    document.getElementById('trialSuccess').classList.add('active');
  });

  // ─── i18n ───────────────────────────────────────
  const translations = {
    ru: {
      'nav-courses':'Курсы','nav-results':'Результаты','nav-instructors':'Преподаватели','nav-testimonials':'Отзывы','nav-faq':'Вопросы','nav-contact':'Контакты','nav-enroll':'Записаться',
      'hero-eyebrow':'Центр английского языка в г. Нукус',
      'hero-title-1':'Говорите по‑английски','hero-title-2':'уверенно',
      'hero-sub':'IELTS, General English и курсы для детей — с преподавателем, который сам сдал IELTS на 9.0. Небольшие группы, разговорная практика и понятный путь к результату.',
      'hero-btn1':'Записаться сейчас','hero-btn2':'Смотреть курсы',
      'hero-daily':'ежедневно','hero-instructor':'Инструктор','hero-address-short':'ул. Н. Сараева 34,','hero-rating':'· Google отзывы',
      'why-eyebrow':'Почему мы','why-title':'Что отличает Stanford',
      'why1-title':'Преподаватель IELTS 9.0','why1-text':'Занятия ведёт инструктор с максимальным баллом IELTS — знает экзамен изнутри.',
      'why2-title':'Небольшие группы','why2-text':'До 10–12 человек в группе — каждому достаётся время на разговорную практику.',
      'why3-title':'Понятный прогресс','why3-text':'Регулярные пробные тесты показывают реальный уровень и что подтянуть.',
      'why4-title':'Гибкое расписание','why4-text':'Центр открыт с 09:00 до 19:00 — подберём удобное время для учёбы и работы.',
      'courses-eyebrow':'Что мы преподаём','courses-title':'Курсы для любого уровня',
      'courses-desc':'От первых слов до штурма IELTS — выберите направление, которое отвечает вашей цели.',
      'course1-level':'Kids · 6–12 лет','course1-name':'Kids English','course1-desc':'Английский через игру, песни и картинки. Первые слова, фразы и уверенность в общении.',
      'course1-price':'250 000 <sub>сум/мес</sub>','course1-duration':'2 занятия в неделю',
      'course2-level':'General · Intermediate','course2-name':'General English','course2-desc':'Грамматика, лексика и разговорная практика для уверенного общения в жизни и на работе.',
      'course2-price':'280 000 <sub>сум/мес</sub>','course2-duration':'3 занятия в неделю',
      'course3-level':'Upper‑Intermediate','course3-name':'Advanced English','course3-desc':'Свободная речь, сложная грамматика и академическая лексика для продвинутых студентов.',
      'course3-price':'320 000 <sub>сум/мес</sub>','course3-duration':'3 занятия в неделю',
      'course4-level':'Exam Prep','course4-name':'IELTS Preparation','course4-desc':'Все 4 модуля экзамена, пробные тесты и стратегии высокого балла с инструктором IELTS 9.0.',
      'course4-price':'380 000 <sub>сум/мес</sub>','course4-duration':'4 занятия в неделю',
      'course-btn':'Записаться',
      'quiz-eyebrow':'Не знаете, с чего начать?','quiz-title':'Подберите свой курс за 20 секунд','quiz-desc':'Ответьте на пару вопросов — подскажем, какая программа подойдёт лучше всего.',
      'quiz-q1':'Кому нужен курс?','quiz-q1-opt1':'Ребёнку, 6–12 лет','quiz-q1-opt2':'Взрослому или подростку',
      'quiz-q2':'Какая у вас цель?','quiz-q2-opt1':'Заговорить увереннее в жизни и на работе','quiz-q2-opt2':'Сдать международный экзамен IELTS','quiz-q2-opt3':'Уже говорю свободно, хочу углубить знания',
      'quiz-result-label':'Вам подходит','quiz-cta':'Смотреть курс →','quiz-restart':'Пройти заново',
      'schedule-eyebrow':'Расписание','schedule-title':'Когда проходят занятия',
      'schedule-th1':'Курс','schedule-th2':'Дни','schedule-th3':'Время',
      'sched1-days':'Пн, Чт','sched2-days':'Пн, Ср, Пт','sched3-days':'Вт, Чт, Сб','sched4-days':'Пн, Вт, Чт, Сб',
      'schedule-note':'Расписание может отличаться в зависимости от набора группы — уточняйте актуальное время по телефону.',
      'results-eyebrow':'Наши результаты','results-title':'Баллы, которыми мы гордимся','results-desc':'Реальные результаты студентов Stanford на международном экзамене IELTS.',
      'rstat1-label':'Средний балл IELTS','rstat2-label':'Подготовлено к экзамену','rstat3-label':'Достигли цели','rstat4-label':'Лет в Нукусе',
      'result-course':'Курс IELTS Preparation',
      'story-badge-label':'Итоговый<br>балл IELTS',
      'story-eyebrow':'История успеха','story-title':'От 5.5 до 7.5 за 4 месяца',
      'story-quote':'«Я думала, что 6.0 — это потолок. Но когда разобрали мои ошибки в Writing по пунктам, всё встало на свои места».',
      'story-meta':'Курс IELTS Preparation · поступила в университет по гранту',
      'story-m1':'Месяц 1','story-m1-text':'Диагностика — пробный тест показал балл 5.5, определили слабые модули.',
      'story-m2':'Месяц 2','story-m2-text':'Плотная работа над Listening и Reading, расширение академической лексики.',
      'story-m3':'Месяц 3','story-m3-text':'Стратегии Writing Task 2 и разбор структуры эссе на реальных темах.',
      'story-m4':'Месяц 4','story-m4-text':'Финальные пробные тесты и день экзамена — результат 7.5.',
      'team-eyebrow':'Наша команда','team-title':'Преподаватели, которым доверяют','team-desc':'Опытные инструкторы, которые не просто знают английский, а умеют довести до результата.',
      'team1-role':'IELTS 9.0 · 7 лет опыта','team2-role':'General English · 5 лет опыта','team3-role':'Kids English · 4 года опыта',
      'gallery-eyebrow':'Загляните к нам','gallery-title':'Жизнь центра изнутри',
      'testi-eyebrow':'Отзывы','testi-title':'Что говорят наши студенты',
      'testi1-text':'Пришла с нуля, а через полгода уже спокойно говорю на бытовые темы. Атмосфера на занятиях лёгкая, не боишься ошибаться.','testi1-role':'General English',
      'testi2-text':'Готовился к IELTS два месяца — разобрали все слабые места и дали чёткую стратегию по Writing. Балл вырос с 5.5 до 7.0.','testi2-role':'IELTS Preparation',
      'testi3-text':'Сын ходит на Kids English уже год — ждёт занятия с нетерпением. Учителя находят подход даже к самым стеснительным детям.','testi3-role':'Родитель, Kids English',
      'faq-eyebrow':'Вопросы и ответы','faq-title':'Частые вопросы',
      'faq1-q':'Как понять, на какой уровень записаться?','faq1-a':'Перед началом занятий мы проводим бесплатное вводное тестирование — определяем реальный уровень и подбираем подходящую группу, будь то Kids, General English или подготовка к IELTS.',
      'faq2-q':'Сколько длится подготовка к IELTS?','faq2-a':'В среднем 2–4 месяца в зависимости от начального уровня и целевого балла. На вводном тестировании мы дадим более точный прогноз именно для вас.',
      'faq3-q':'Можно ли перейти в другую группу, если не подошло время?','faq3-a':'Да, если в другой группе того же уровня есть свободные места, мы поможем перевестись без потери оплаченных занятий.',
      'faq4-q':'С какого возраста можно записать ребёнка?','faq4-a':'Курс Kids English рассчитан на детей от 6 до 12 лет. Группы формируются с учётом возраста и уровня, чтобы занятия были интересными и понятными.',
      'faq5-q':'Что если я пропущу занятие?','faq5-a':'Ничего страшного — преподаватель кратко введёт вас в курс пройденного материала на следующем занятии. При частых пропусках рекомендуем индивидуальную консультацию.',
      'faq6-q':'Как оплачивать занятия?','faq6-a':'Оплата помесячная, наличными или переводом в центре. Подробности уточним при записи по телефону или на месте.',
      'ctabanner-title':'Готовы начать говорить по‑английски?','ctabanner-sub':'Запишитесь на бесплатное вступительное занятие — определим ваш уровень и подберём группу.',
      'trial-name-label':'Имя','trial-name-ph':'Ваше имя','trial-name-error':'Укажите имя',
      'trial-phone-label':'Телефон','trial-phone-error':'Введите номер телефона',
      'trial-course-label':'Курс','trial-course-opt0':'Выберите курс','trial-course-error':'Выберите курс',
      'trial-submit':'Записаться',
      'trial-success-title':'Заявка отправлена!','trial-success-text':'Мы свяжемся с вами в ближайшее время, чтобы подтвердить бесплатное пробное занятие.',
      'trial-privacy':'Мы свяжемся только по поводу вашей записи. Никакого спама.',
      'contact-eyebrow':'Контакты','contact-title':'Приходите к нам в гости',
      'contact-address-label':'Адрес','contact-address-value':'ул. Н. Сараева 34, 230100, Нукус, Республика Каракалпакстан, Узбекистан',
      'contact-phones-label':'Телефоны','contact-hours-label':'Часы работы','contact-hours-value':'Ежедневно, 09:00–19:00',
      'contact-status':'Открыто · Закроется в 19:00','contact-map-btn':'Открыть в Google Maps →',
      'footer-desc':'Языковой центр в Нукусе: IELTS Preparation, General English и курсы для детей. Учим говорить по‑английски уверенно.',
      'footer-courses-h4':'Курсы','footer-contact-h4':'Контакты',
      'footer-copy':'© 2026 Stanford Educational Centre · Нукус, Каракалпакстан','footer-hours':'09:00–19:00 · Ежедневно'
    },
    en: {
      'nav-courses':'Courses','nav-results':'Results','nav-instructors':'Instructors','nav-testimonials':'Reviews','nav-faq':'FAQ','nav-contact':'Contact','nav-enroll':'Enroll Now',
      'hero-eyebrow':'English Language Centre in Nukus',
      'hero-title-1':'Speak English with','hero-title-2':'confidence',
      'hero-sub':'IELTS, General English, and courses for kids — taught by an instructor who scored IELTS 9.0 himself. Small groups, real conversation practice, and a clear path to results.',
      'hero-btn1':'Enroll Now','hero-btn2':'View Courses',
      'hero-daily':'daily','hero-instructor':'Instructor','hero-address-short':'34 N. Sarayev St.,','hero-rating':'· Google reviews',
      'why-eyebrow':'Why Us','why-title':'What Sets Stanford Apart',
      'why1-title':'IELTS 9.0 Instructor','why1-text':'Classes are led by an instructor with a top IELTS score — who knows the exam inside out.',
      'why2-title':'Small Groups','why2-text':'Up to 10–12 students per group, so everyone gets real speaking practice.',
      'why3-title':'Clear Progress','why3-text':'Regular mock tests show your real level and exactly what to work on.',
      'why4-title':'Flexible Schedule','why4-text':'Open daily from 9 AM to 7 PM — we\'ll find a time that fits your study and work.',
      'courses-eyebrow':'What We Teach','courses-title':'Courses for Every Level',
      'courses-desc':'From first words to IELTS band scores — pick the track that matches your goal.',
      'course1-level':'Kids · Ages 6–12','course1-name':'Kids English','course1-desc':'English through games, songs, and pictures. First words, phrases, and confidence in communication.',
      'course1-price':'250,000 <sub>UZS/mo</sub>','course1-duration':'2 lessons a week',
      'course2-level':'General · Intermediate','course2-name':'General English','course2-desc':'Grammar, vocabulary, and speaking practice for confident everyday and workplace communication.',
      'course2-price':'280,000 <sub>UZS/mo</sub>','course2-duration':'3 lessons a week',
      'course3-level':'Upper‑Intermediate','course3-name':'Advanced English','course3-desc':'Fluent speech, advanced grammar, and academic vocabulary for advanced students.',
      'course3-price':'320,000 <sub>UZS/mo</sub>','course3-duration':'3 lessons a week',
      'course4-level':'Exam Prep','course4-name':'IELTS Preparation','course4-desc':'All 4 exam modules, mock tests, and high-score strategies with an IELTS 9.0 instructor.',
      'course4-price':'380,000 <sub>UZS/mo</sub>','course4-duration':'4 lessons a week',
      'course-btn':'Enroll Now',
      'quiz-eyebrow':'Not Sure Where to Start?','quiz-title':'Find Your Course in 20 Seconds','quiz-desc':'Answer a couple of questions and we\'ll point you to the right program.',
      'quiz-q1':'Who is this course for?','quiz-q1-opt1':'A child, aged 6–12','quiz-q1-opt2':'An adult or teenager',
      'quiz-q2':'What\'s your goal?','quiz-q2-opt1':'Speak more confidently in life and at work','quiz-q2-opt2':'Pass the international IELTS exam','quiz-q2-opt3':'Already fluent, want to go deeper',
      'quiz-result-label':'You\'d be a great fit for','quiz-cta':'View Course →','quiz-restart':'Start Over',
      'schedule-eyebrow':'Schedule','schedule-title':'When Classes Meet',
      'schedule-th1':'Course','schedule-th2':'Days','schedule-th3':'Time',
      'sched1-days':'Mon, Thu','sched2-days':'Mon, Wed, Fri','sched3-days':'Tue, Thu, Sat','sched4-days':'Mon, Tue, Thu, Sat',
      'schedule-note':'Schedule may vary depending on group formation — please confirm the current time by phone.',
      'results-eyebrow':'Our Results','results-title':'Scores We\'re Proud Of','results-desc':'Real results from Stanford students on the international IELTS exam.',
      'rstat1-label':'Average IELTS Score','rstat2-label':'Students Prepped','rstat3-label':'Reached Their Goal','rstat4-label':'Years in Nukus',
      'result-course':'IELTS Preparation Course',
      'story-badge-label':'Final<br>IELTS Score',
      'story-eyebrow':'Success Story','story-title':'From 5.5 to 7.5 in 4 Months',
      'story-quote':'"I thought 6.0 was my ceiling. But once we broke down my Writing mistakes point by point, everything clicked."',
      'story-meta':'IELTS Preparation Course · admitted to university on a grant',
      'story-m1':'Month 1','story-m1-text':'Diagnostic mock test showed a 5.5 — we identified the weak modules.',
      'story-m2':'Month 2','story-m2-text':'Focused work on Listening and Reading, building academic vocabulary.',
      'story-m3':'Month 3','story-m3-text':'Writing Task 2 strategies and essay structure practice on real topics.',
      'story-m4':'Month 4','story-m4-text':'Final mock tests and exam day — a 7.5 result.',
      'team-eyebrow':'Our Team','team-title':'Instructors Students Trust','team-desc':'Experienced instructors who don\'t just know English — they know how to get you results.',
      'team1-role':'IELTS 9.0 · 7 years experience','team2-role':'General English · 5 years experience','team3-role':'Kids English · 4 years experience',
      'gallery-eyebrow':'Take a Look Inside','gallery-title':'Life at the Centre',
      'testi-eyebrow':'Reviews','testi-title':'What Our Students Say',
      'testi1-text':'I started from zero, and six months later I speak comfortably about everyday things. The classes feel relaxed — you\'re not afraid to make mistakes.','testi1-role':'General English',
      'testi2-text':'I prepped for IELTS for two months — we broke down every weak spot and got a clear Writing strategy. My score went from 5.5 to 7.0.','testi2-role':'IELTS Preparation',
      'testi3-text':'My son has been going to Kids English for a year and looks forward to every class. The teachers find a way to reach even the shyest kids.','testi3-role':'Parent, Kids English',
      'faq-eyebrow':'FAQ','faq-title':'Frequently Asked Questions',
      'faq1-q':'How do I know which level to join?','faq1-a':'Before you start, we run a free placement test to assess your real level and match you with the right group — Kids, General English, or IELTS Preparation.',
      'faq2-q':'How long does IELTS prep take?','faq2-a':'On average 2–4 months, depending on your starting level and target score. Your placement test will give you a more precise estimate.',
      'faq3-q':'Can I switch groups if the schedule doesn\'t work?','faq3-a':'Yes — if another group at the same level has open seats, we\'ll help you transfer without losing any paid lessons.',
      'faq4-q':'What age can a child start Kids English?','faq4-a':'Kids English is designed for children aged 6 to 12. Groups are formed by age and level so lessons stay engaging and easy to follow.',
      'faq5-q':'What if I miss a lesson?','faq5-a':'No problem — your teacher will briefly catch you up at the next class. If you miss several in a row, we recommend a short one-on-one review.',
      'faq6-q':'How do I pay for classes?','faq6-a':'Payment is monthly, by cash or transfer at the centre. We\'ll confirm the details when you register by phone or in person.',
      'ctabanner-title':'Ready to Start Speaking English?','ctabanner-sub':'Book a free placement lesson — we\'ll assess your level and find the right group.',
      'trial-name-label':'Name','trial-name-ph':'Your name','trial-name-error':'Please enter your name',
      'trial-phone-label':'Phone','trial-phone-error':'Please enter a valid phone number',
      'trial-course-label':'Course','trial-course-opt0':'Select a course','trial-course-error':'Please select a course',
      'trial-submit':'Enroll Now',
      'trial-success-title':'Application Sent!','trial-success-text':'We\'ll be in touch shortly to confirm your free trial lesson.',
      'trial-privacy':'We\'ll only contact you about your booking. No spam.',
      'contact-eyebrow':'Contact','contact-title':'Come Visit Us',
      'contact-address-label':'Address','contact-address-value':'34 N. Sarayev St., 230100, Nukus, Republic of Karakalpakstan, Uzbekistan',
      'contact-phones-label':'Phone Numbers','contact-hours-label':'Working Hours','contact-hours-value':'Daily, 9:00 AM–7:00 PM',
      'contact-status':'Open · Closes at 7:00 PM','contact-map-btn':'Open in Google Maps →',
      'footer-desc':'English language centre in Nukus: IELTS Preparation, General English, and courses for kids. Helping you speak English with confidence.',
      'footer-courses-h4':'Courses','footer-contact-h4':'Contact',
      'footer-copy':'© 2026 Stanford Educational Centre · Nukus, Karakalpakstan','footer-hours':'9:00 AM–7:00 PM · Daily'
    }
  };

  function setLanguage(lang){
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang][key] !== undefined) el.innerHTML = translations[lang][key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (translations[lang][key] !== undefined) el.setAttribute('placeholder', translations[lang][key]);
    });
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
  }
