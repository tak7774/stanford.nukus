# -*- coding: utf-8 -*-
"""Source of all website texts in RU / QQ (Qaraqalpaqsha, Latin 2016) / EN.

Edit a row here, then run:  python tools/make_translations.py
Writes translations.js (window.TRANSLATIONS = {...} as JSON) used by index.html and mock.html.
Each row: (key, ru, kaa, en). {n}, {max}, {date}, {name}, {method}, {b} are placeholders.
"""
import json
import os

# Files are written to the project folder (one level up from tools/)
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

PHONE = "+998 91 303-60-01"

ROWS = [
    # ── Header / common ──
    ("nav-courses", "Курсы", "Kurslar", "Courses"),
    ("nav-mock", "Mock Exam", "Mock Exam", "Mock Exam"),
    ("nav-portal", "Кабинет", "Kabinet", "Portal"),
    ("portal-page-title", "Кабинет студента и преподавателя | Stanford Language Center", "Student hám oqıtıwshı kabineti | Stanford Language Center", "Student and teacher portal | Stanford Language Center"),
    ("nav-results", "Результаты", "Nátiyjeler", "Results"),
    ("nav-teachers", "Преподаватели", "Oqıtıwshılar", "Teachers"),
    ("nav-faq", "Вопросы", "Sorawlar", "FAQ"),
    ("nav-contact", "Контакты", "Baylanıs", "Contact"),
    ("nav-enroll", "Записаться", "Jazılıw", "Enroll"),
    ("nav-menu", "Меню", "Menyu", "Menu"),
    ("nav-home", "На главную", "Bas betke", "Home"),
    ("lang-label", "Язык сайта", "Sayt tili", "Site language"),
    ("call", "Позвонить", "Qońıraw etiw", "Call us"),
    ("close", "Закрыть", "Jabıw", "Close"),
    ("currency", "сум", "sum", "UZS"),
    ("alert-send-fail", f"Не удалось отправить. Позвоните нам: {PHONE}", f"Jiberiw ámelge aspadı. Bizge qońıraw etiń: {PHONE}", f"Could not send. Please call us: {PHONE}"),

    # ── Hero ──
    ("hero-title", "Английский и IELTS в Нукусе", "Nókiste inglis tili hám IELTS", "English and IELTS in Nukus"),
    ("hero-sub", "IELTS, General English и курсы для детей. Занятия ведёт преподаватель с баллом IELTS 9.0.",
     "IELTS, General English hám balalar ushın kurslar. Sabaqlardı IELTS 9.0 balına iye oqıtıwshı ótkeredi.",
     "IELTS, General English and courses for kids, taught by a teacher with an IELTS score of 9.0."),
    ("hero-cta", "Пробный урок бесплатно", "Biypul sınaq sabaq", "Free trial lesson"),
    ("hero-mock", "Записаться на Mock", "Mock-qa jazılıw", "Book a mock exam"),
    ("fact1", "балл IELTS нашего преподавателя", "oqıtıwshımızdıń IELTS balı", "our teacher's IELTS score"),
    ("fact2", "лет в Нукусе", "jıl Nókiste", "years in Nukus"),
    ("fact3", "каждый день", "hár kúni", "every day"),
    ("about-title", "О нас", "Biz haqqımızda", "About us"),
    ("about-desc", "Языковой центр в Нукусе: английский для детей и взрослых и подготовка к IELTS.",
     "Nókistegi til orayı: balalar hám úlkenler ushın inglis tili hám IELTS-ke tayarlıq.",
     "A language centre in Nukus: English for children and adults, and IELTS preparation."),
    ("about-link", "Записаться на пробный урок", "Sınaq sabaqqa jazılıw", "Book a trial lesson"),
    ("fact4", "человек в группе", "adam toparda", "students per group"),
    ("fact5", "курса — от детей до IELTS", "kurs — balalardan IELTS-ke shekem", "courses, from kids to IELTS"),
    ("adv-mock-title", "IELTS CD Mock на компьютере", "Kompyuterde IELTS CD Mock", "IELTS CD Mock on a computer"),
    ("adv-mock-text", "Пробный экзамен в формате настоящего: все 4 части, результат по каждой и билет онлайн.",
     "Haqıyqıy imtihan formatındaǵı sınaq imtihanı: barlıq 4 bólim, hár biri boyınsha nátiyje hám onlayn bilet.",
     "A practice exam in the real format: all 4 parts, a score for each and an online ticket."),
    ("adv-mock-btn", "Выбрать дату", "Sáneni tańlaw", "Choose a date"),
  ("theme-toggle", "Тёмная тема", "Qarańǵı tema", "Dark mode"),
  ("footer-photo", "Фото", "Súwret", "Photo"),

    # ── Why ──
    ("why-title", "Почему Stanford", "Nege Stanford", "Why Stanford"),
    ("why-desc", "Учим так, чтобы вы заговорили и сдали экзамен — без лишней теории.",
     "Artıqsha teoriyasız, erkin sóylewińiz hám imtihandı tapsırıwıńız ushın oqıtamız.",
     "We teach so you speak and pass the exam, without needless theory."),
    ("why1-title", "Преподаватель IELTS 9.0", "IELTS 9.0 oqıtıwshı", "An IELTS 9.0 teacher"),
    ("why1-text", "Занятия ведёт инструктор с максимальным баллом IELTS — знает экзамен изнутри.",
     "Sabaqlardı IELTS boyınsha eń joqarı balǵa iye oqıtıwshı ótkeredi — ol imtihandı ishinen biledi.",
     "Classes are led by a teacher with the top IELTS score, who knows the exam inside out."),
    ("why2-title", "Небольшие группы", "Kishi toparlar", "Small groups"),
    ("why2-text", "До 10–12 человек в группе — каждому достаётся время на разговорную практику.",
     "Toparda 10–12 adamǵa shekem — hár kimge sóylesiw ámeliyatına waqıt jetedi.",
     "Up to 10–12 students per group, so everyone gets time to speak."),
    ("why3-title", "Понятный прогресс", "Anıq rawajlanıw", "Clear progress"),
    ("why3-text", "Регулярные пробные тесты показывают реальный уровень и что подтянуть.",
     "Turaqlı sınaq testleri haqıyqıy dárejeńizdi hám neni jaqsılaw kerekligin kórsetedi.",
     "Regular practice tests show your real level and what to work on."),
    ("why4-title", "Бесплатный пробный урок", "Biypul sınaq sabaq", "Free trial lesson"),
    ("why4-text", "Приходите на пробный урок — определим ваш уровень и подберём подходящую группу.",
     "Sınaq sabaqqa keliń — dárejeńizdi anıqlap, mánisli topar tańlap beremiz.",
     "Come to a trial lesson and we will find your level and the right group."),

    # ── Courses ──
    ("courses-title", "Курсы", "Kurslar", "Courses"),
    ("courses-desc", "От первых слов до IELTS. Цена — за месяц занятий.",
     "Birinshi sózlerden IELTS-ke shekem. Baha — bir aylıq sabaq ushın.",
     "From first words to IELTS. Prices are per month."),
    ("course1-level", "Дети 6–12 лет", "6–12 jastaǵı balalar", "Kids aged 6–12"),
    ("course1-name", "Kids English", "Kids English", "Kids English"),
    ("course1-desc", "Английский через игру, песни и картинки. Первые слова, фразы и уверенность в общении.",
     "Inglis tilin oyın, qosıq hám súwretler arqalı úyreniw. Birinshi sózler, gápler hám sóylesiwde isenim.",
     "English through games, songs and pictures: first words, phrases and confidence."),
    ("course1-f1", "Игры, песни и картинки", "Oyınlar, qosıqlar hám súwretler", "Games, songs and pictures"),
    ("course1-f2", "Первые слова и фразы", "Birinshi sózler hám gápler", "First words and phrases"),
    ("course1-duration", "2 занятия в неделю", "Háptesine 2 sabaq", "2 lessons a week"),
    ("course1-price", "250 000", "250 000", "250,000"),
    ("course2-level", "Средний уровень", "Orta dáreje", "Intermediate"),
    ("course2-name", "General English", "General English", "General English"),
    ("course2-desc", "Грамматика, лексика и разговорная практика для уверенного общения в жизни и на работе.",
     "Turmısta hám jumısta erkin sóylesiw ushın grammatika, sózlik qor hám sóylesiw ámeliyatı.",
     "Grammar, vocabulary and speaking practice for everyday life and work."),
    ("course2-f1", "Грамматика и лексика", "Grammatika hám sózlik qor", "Grammar and vocabulary"),
    ("course2-f2", "Разговорная практика", "Sóylesiw ámeliyatı", "Speaking practice"),
    ("course2-duration", "3 занятия в неделю", "Háptesine 3 sabaq", "3 lessons a week"),
    ("course2-price", "280 000", "280 000", "280,000"),
    ("course3-level", "Выше среднего", "Ortadan joqarı", "Upper-intermediate"),
    ("course3-name", "Advanced English", "Advanced English", "Advanced English"),
    ("course3-desc", "Свободная речь, сложная грамматика и академическая лексика для продвинутых студентов.",
     "Alǵa ketken studentler ushın erkin sóylew, quramalı grammatika hám akademiyalıq sózlik qor.",
     "Fluent speech, advanced grammar and academic vocabulary for advanced students."),
    ("course3-f1", "Свободная речь", "Erkin sóylew", "Fluent speaking"),
    ("course3-f2", "Академическая лексика", "Akademiyalıq sózlik qor", "Academic vocabulary"),
    ("course3-duration", "3 занятия в неделю", "Háptesine 3 sabaq", "3 lessons a week"),
    ("course3-price", "320 000", "320 000", "320,000"),
    ("course4-level", "Подготовка к экзамену", "Imtihanǵa tayarlıq", "Exam preparation"),
    ("course4-name", "IELTS Preparation", "IELTS Preparation", "IELTS Preparation"),
    ("course4-desc", "Все 4 модуля экзамена, пробные тесты и стратегии высокого балла с инструктором IELTS 9.0.",
     "Imtihannıń 4 bólimi, sınaq testleri hám IELTS 9.0 oqıtıwshı menen joqarı ball strategiyaları.",
     "All 4 exam modules, practice tests and high-score strategies with an IELTS 9.0 teacher."),
    ("course4-f1", "Все 4 модуля экзамена", "Imtihannıń 4 bólimi", "All 4 exam modules"),
    ("course4-f2", "Пробные тесты и стратегии", "Sınaq testleri hám strategiyalar", "Practice tests and strategies"),
    ("course4-duration", "4 занятия в неделю", "Háptesine 4 sabaq", "4 lessons a week"),
    ("course4-price", "380 000", "380 000", "380,000"),
    ("per-month", "сум в месяц", "sum ayına", "UZS a month"),
    ("course-btn", "Записаться", "Jazılıw", "Enroll"),

    # ── Course modal (name + phone) ──
    ("cm-title", "Запись на курс", "Kursqa jazılıw", "Enroll in a course"),
    ("cm-sub", "Оставьте имя и телефон — администратор перезвонит и подберёт группу.",
     "Atıńız hám telefon nomerińizdi qaldırıń — administrator qońıraw etip, topar tańlap beredi.",
     "Leave your name and phone. An administrator will call back and find you a group."),
    ("cm-submit", "Отправить заявку", "Arza jiberiw", "Send request"),
    ("cm-success-title", "Заявка отправлена", "Arza jiberildi", "Request sent"),
    ("cm-success-text", "Мы перезвоним вам в рабочее время.",
     "Sizge jumıs waqtında qońıraw etemiz.",
     "We will call you back during working hours."),

    # ── Form fields (both lead forms) ──
    ("f-name", "Ваше имя", "Atıńız", "Your name"),
    ("f-name-error", "Укажите имя", "Atıńızdı jazıń", "Please enter your name"),
    ("f-phone", "Номер телефона", "Telefon nomerińiz", "Phone number"),
    ("f-phone-error", "Введите номер полностью: +998 и 9 цифр", "Nomerdi tolıq jazıń: +998 hám 9 san", "Enter the full number: +998 and 9 digits"),
    ("f-course", "Курс", "Kurs", "Course"),
    ("f-course-opt0", "Выберите курс", "Kurstı tańlań", "Choose a course"),
    ("f-course-unsure", "Не знаю — помогите выбрать", "Bilmeymen — tańlawǵa járdem beriń", "Not sure — help me choose"),
    ("f-course-error", "Выберите курс", "Kurstı tańlań", "Please choose a course"),
    ("f-time", "Удобное время", "Qolaylı waqıt", "Preferred time"),
    ("f-time-morning", "Утро", "Azanda", "Morning"),
    ("f-time-day", "День", "Túste", "Afternoon"),
    ("f-time-evening", "Вечер", "Keshte", "Evening"),
    ("f-time-error", "Выберите время", "Waqıttı tańlań", "Please choose a time"),
    ("f-comment", "Комментарий", "Pikir", "Comment"),
    ("f-optional", "необязательно", "mindetli emes", "optional"),
    ("f-comment-ph", "Например: хочу заниматься вместе с ребёнком", "Mısalı: balam menen birge oqıǵım keledi", "For example: I'd like to study together with my child"),
    ("f-privacy", "Мы позвоним только по поводу заявки.", "Tek arzańız boyınsha qońıraw etemiz.", "We will only call you about your request."),
    ("f-sending", "Отправляем…", "Jiberilmekte…", "Sending…"),

    # ── Apply form (bottom) ──
    ("apply-title", "Оставить заявку", "Arza qaldırıw", "Apply"),
    ("apply-sub", "Расскажите, что вам нужно, — перезвоним, ответим на вопросы и запишем на бесплатный пробный урок.",
     "Sizge ne kerek ekenin jazıń — qońıraw etip, sorawlarıńızǵa juwap beremiz hám biypul sınaq sabaqqa jazamız.",
     "Tell us what you need. We'll call back, answer your questions and book a free trial lesson."),
    ("apply-point1", "Бесплатный пробный урок", "Biypul sınaq sabaq", "A free trial lesson"),
    ("apply-point2", "Определим ваш уровень", "Dárejeńizdi anıqlaymız", "We'll find your level"),
    ("apply-point3", "Подберём группу и время", "Topar hám waqıt tańlaymız", "We'll match a group and time"),
    ("apply-submit", "Отправить заявку", "Arza jiberiw", "Send request"),
    ("apply-success-title", "Спасибо, заявка у нас", "Raxmet, arzańız qabıl etildi", "Thank you, we have your request"),
    ("apply-success-text", "Администратор позвонит вам в рабочее время.",
     "Administrator sizge jumıs waqtında qońıraw etedi.",
     "An administrator will call you during working hours."),
    ("apply-again", "Отправить ещё одну заявку", "Jáne bir arza jiberiw", "Send another request"),

    # ── Mock exam cards on index ──
    ("mock-title", "IELTS CD Mock Exam", "IELTS CD Mock Exam", "IELTS CD Mock Exam"),
    ("mock-desc", "Пробный IELTS на компьютере, как в настоящем тестовом центре. После экзамена — результат по каждой части.",
     "Kompyuterde sınaq IELTS, haqıyqıy test orayındaǵıday. Imtihannan keyin — hár bólim boyınsha nátiyje.",
     "A practice IELTS on computer, just like a real test centre, with a score for each part afterwards."),
    ("mock-loading", "Загружаем даты…", "Sánele júklenbekte…", "Loading dates…"),
    ("mock-none", "Сейчас нет открытых дат. Позвоните:", "Házirshe ashıq sáneler joq. Qońıraw etiń:", "No open dates right now. Call us:"),
    ("mock-full", "Мест нет", "Orın joq", "Fully booked"),
    ("mock-seats", "Свободно {n} из {max}", "Bos orın: {n} / {max}", "{n} of {max} seats free"),
    ("mock-min", "мин", "min", "min"),
    ("mock-book", "Выбрать", "Tańlaw", "Choose"),
    ("mock-all", "Все даты и запись", "Barlıq sáneler hám jazılıw", "All dates and booking"),
    ("mock-lookup", "Узнать результат Mock", "Mock nátiyjesin biliw", "Check your mock result"),

    # ── Quiz ──
    ("quiz-title", "Подбор курса", "Kurs tańlaw", "Find your course"),
    ("quiz-desc", "Два вопроса — и подскажем, какая программа подойдёт.",
     "Eki soraw — hám sizge qaysı kurs sáykes keletuǵının aytamız.",
     "Two questions, and we'll suggest the right course."),
    ("quiz-q1", "Кому нужен курс?", "Kurs kimge kerek?", "Who is the course for?"),
    ("quiz-q1-opt1", "Ребёнку, 6–12 лет", "Balaǵa, 6–12 jas", "A child, aged 6–12"),
    ("quiz-q1-opt2", "Взрослому или подростку", "Úlkenge yamasa óspirimge", "An adult or teenager"),
    ("quiz-q2", "Какая у вас цель?", "Maqsetińiz qanday?", "What's your goal?"),
    ("quiz-q2-opt1", "Заговорить увереннее в жизни и на работе", "Turmısta hám jumısta erkin sóylesiw", "Speak more confidently in life and at work"),
    ("quiz-q2-opt2", "Сдать международный экзамен IELTS", "Xalıqaralıq IELTS imtihanın tapsırıw", "Pass the international IELTS exam"),
    ("quiz-q2-opt3", "Уже говорю свободно, хочу углубить знания", "Erkin sóyleymen, bilimimdi tereńletkim keledi", "I'm already fluent and want to go deeper"),
    ("quiz-result-label", "Вам подходит", "Sizge sáykes keledi", "Your best fit"),
    ("quiz-cta", "Записаться на этот курс", "Bul kursqa jazılıw", "Enroll in this course"),
    ("quiz-restart", "Пройти заново", "Qaytadan baslaw", "Start over"),

    # ── Schedule ──
    ("schedule-title", "Расписание", "Sabaq kestesi", "Schedule"),
    ("schedule-th1", "Курс", "Kurs", "Course"),
    ("schedule-th2", "Дни", "Kúnler", "Days"),
    ("schedule-th3", "Время", "Waqıt", "Time"),
    ("sched1-days", "Пн, Чт", "Du, Pi", "Mon, Thu"),
    ("sched2-days", "Пн, Ср, Пт", "Du, Sá, Ju", "Mon, Wed, Fri"),
    ("sched3-days", "Вт, Чт, Сб", "Si, Pi, Sh", "Tue, Thu, Sat"),
    ("sched4-days", "Пн, Вт, Чт, Сб", "Du, Si, Pi, Sh", "Mon, Tue, Thu, Sat"),
    ("schedule-note", "Время может меняться при наборе новой группы — уточняйте по телефону.",
     "Jańa topar jıynalǵanda waqıt ózgeriwi múmkin — telefon arqalı anıqlań.",
     "Times may change when a new group starts, so please check by phone."),

    # ── Results ──
    ("results-title", "Результаты", "Nátiyjeler", "Results"),
    ("results-desc", "Настоящие баллы IELTS наших студентов.", "Studentlerimizdiń haqıyqıy IELTS balları.", "Real IELTS scores of our students."),

    # ── Teachers ──
    ("team-title", "Преподаватели", "Oqıtıwshılar", "Teachers"),
    ("team-desc", "Те, кто ведёт занятия каждый день.", "Hár kúni sabaq ótetuǵın oqıtıwshılarımız.", "The people who teach every day."),
    ("team-exp", "Опыт: {n} {yrs}", "Tájiriybe: {n} jıl", "{n} {yrs} of experience"),
    ("yr-one", "год", "jıl", "year"),
    ("yr-few", "года", "jıl", "years"),
    ("yr-many", "лет", "jıl", "years"),

    # ── Gallery ──
    ("gallery-title", "Галерея", "Galereya", "Gallery"),
    ("gallery-desc", "Наши классы и занятия.", "Klaslarımız hám sabaqlarımız.", "Our classrooms and lessons."),

    # ── FAQ ──
    ("faq-title", "Вопросы", "Sorawlar", "FAQ"),
    ("faq-desc", "Не нашли ответ — позвоните, объясним.", "Juwap tappasańız — qońıraw etiń, túsindiremiz.", "Didn't find an answer? Call us and we'll explain."),
    ("faq1-q", "Как понять, на какой уровень записаться?", "Qaysı dárejege jazılıwdı qalay bilemen?", "How do I know which level to join?"),
    ("faq1-a", "Перед началом занятий мы проводим бесплатное вводное тестирование — определяем реальный уровень и подбираем подходящую группу, будь то Kids, General English или подготовка к IELTS.",
     "Sabaqlar baslanbastan aldın biypul kiris testin ótkeremiz — haqıyqıy dárejeńizdi anıqlap, Kids, General English yamasa IELTS-ke tayarlıq toparın tańlaymız.",
     "Before you start, we run a free placement test to find your real level and match you with the right group: Kids, General English or IELTS preparation."),
    ("faq2-q", "Сколько длится подготовка к IELTS?", "IELTS-ke tayarlıq qansha waqıt aladı?", "How long does IELTS preparation take?"),
    ("faq2-a", "В среднем 2–4 месяца в зависимости от начального уровня и целевого балла. На вводном тестировании мы дадим более точный прогноз именно для вас.",
     "Ortasha 2–4 ay, baslanǵısh dárejeńiz hám maqset etken balıńızǵa baylanıslı. Kiris testinde tek siz ushın anıǵıraq boljaw beremiz.",
     "On average 2–4 months, depending on your starting level and target score. The placement test gives a more precise estimate."),
    ("faq3-q", "Можно ли перейти в другую группу, если не подошло время?", "Waqıt sáykes kelmese, basqa toparǵa ótiwge bola ma?", "Can I switch groups if the time doesn't suit me?"),
    ("faq3-a", "Да, если в другой группе того же уровня есть свободные места, мы поможем перевестись без потери оплаченных занятий.",
     "Awa, sol dárejedegi basqa toparda bos orın bolsa, tólengen sabaqlarıńızdı joǵaltpay ótiwge járdem beremiz.",
     "Yes. If another group at the same level has free places, we'll help you move without losing paid lessons."),
    ("faq4-q", "С какого возраста можно записать ребёнка?", "Balanı neshe jastan jazdırıwǵa boladı?", "From what age can a child join?"),
    ("faq4-a", "Курс Kids English рассчитан на детей от 6 до 12 лет. Группы формируются с учётом возраста и уровня, чтобы занятия были интересными и понятными.",
     "Kids English kursı 6 jastan 12 jasqa shekemgi balalarǵa arnalǵan. Sabaqlar qızıqlı hám túsinikli bolıwı ushın toparlar jas hám dárejege qarap dúziledi.",
     "Kids English is for children aged 6 to 12. Groups are formed by age and level so lessons stay interesting and clear."),
    ("faq5-q", "Что если я пропущу занятие?", "Sabaqtı qaldırıp ketsem ne boladı?", "What if I miss a lesson?"),
    ("faq5-a", "Ничего страшного — преподаватель кратко введёт вас в курс пройденного материала на следующем занятии. При частых пропусках рекомендуем индивидуальную консультацию.",
     "Qorqınıshlı hesh nárse joq — keyingi sabaqta oqıtıwshı ótilgen temanı qısqasha túsindiredi. Jiyi qaldırǵanda jeke konsultaciya usınamız.",
     "No problem: your teacher will briefly catch you up next lesson. If you miss often, we suggest a one-to-one session."),
    ("faq6-q", "Как оплачивать занятия?", "Sabaqlar ushın qalay tóleymen?", "How do I pay for lessons?"),
    ("faq6-a", "Оплата помесячная, наличными или переводом в центре. Подробности уточним при записи по телефону или на месте.",
     "Tólem ayına bir ret, orayda naq aqsha yamasa awdarma arqalı. Tolıq maǵlıwmattı jazılıw waqtında telefon arqalı yamasa orayda aytamız.",
     "Payment is monthly, in cash or by transfer at the centre. We'll confirm details when you sign up."),

    # ── Contact / footer ──
    ("contact-title", "Контакты", "Baylanıs", "Contact"),
    ("contact-address-label", "Адрес", "Mánzil", "Address"),
    ("contact-address-value", "ул. Н. Сараева 34, 230100, Нукус, Республика Каракалпакстан, Узбекистан",
     "N. Saraev kóshesi 34, 230100, Nókis, Qaraqalpaqstan Respublikası, Ózbekstan",
     "34 N. Sarayev St., 230100, Nukus, Republic of Karakalpakstan, Uzbekistan"),
    ("contact-phones-label", "Телефоны", "Telefonlar", "Phones"),
    ("contact-hours-label", "Часы работы", "Jumıs waqtı", "Opening hours"),
    ("contact-hours-value", "Каждый день, 09:00–19:00", "Hár kúni, 09:00–19:00", "Every day, 09:00–19:00"),
    ("contact-map-btn", "Открыть в Google Maps", "Google Maps-ta ashıw", "Open in Google Maps"),
    ("footer-desc", "Языковой центр в Нукусе: IELTS, General English и курсы для детей.",
     "Nókistegi til orayı: IELTS, General English hám balalar ushın kurslar.",
     "Language centre in Nukus: IELTS, General English and courses for kids."),
    ("footer-copy", "© 2026 Stanford Language Center, Нукус", "© 2026 Stanford Language Center, Nókis", "© 2026 Stanford Language Center, Nukus"),

    # ══ mock.html ══
    ("m-page-title", "IELTS CD Mock Exam — запись", "IELTS CD Mock Exam — jazılıw", "IELTS CD Mock Exam — booking"),
    ("m-hero-sub", "Пробный IELTS на компьютере, как в настоящем тестовом центре. Запись — в три шага.",
     "Kompyuterde sınaq IELTS, haqıyqıy test orayındaǵıday. Jazılıw — úsh qádemde.",
     "A practice IELTS on computer, like a real test centre. Booking takes three steps."),
    ("m-step1", "Данные", "Maǵlıwmat", "Details"),
    ("m-step2", "Дата", "Sáne", "Date"),
    ("m-step3", "Оплата", "Tólem", "Payment"),
    ("m-s1-title", "Ваши данные", "Siziń maǵlıwmatlarıńız", "Your details"),
    ("m-s1-desc", "Как в паспорте или ID-карте — так они будут написаны в билете.",
     "Pasport yamasa ID-kartadaǵıday jazıń — biletke solay jazıladı.",
     "As in your passport or ID card; this is how they will appear on your ticket."),
    ("m-first", "Имя", "Atıńız", "First name"),
    ("m-last", "Фамилия", "Familiyańız", "Last name"),
    ("m-gender", "Пол", "Jınısıńız", "Gender"),
    ("m-male", "Мужской", "Er", "Male"),
    ("m-female", "Женский", "Hayal", "Female"),
    ("m-err-first", "Укажите имя", "Atıńızdı jazıń", "Please enter your first name"),
    ("m-err-last", "Укажите фамилию", "Familiyańızdı jazıń", "Please enter your last name"),
    ("m-next", "Далее", "Dawam etiw", "Next"),
    ("m-back", "Назад", "Artqa", "Back"),
    ("m-chosen", "Выбрано: {date}", "Tańlandı: {date}", "Selected: {date}"),
    ("m-s2-title", "Выберите день", "Kúndi tańlań", "Choose a day"),
    ("m-s2-desc", "Жёлтые дни — есть свободные места. Нажмите на день, чтобы увидеть время.",
     "Sarı kúnlerde bos orınlar bar. Waqıttı kóriw ushın kúndi basıń.",
     "Yellow days have free seats. Tap a day to see the times."),
    ("m-legend-open", "Есть места", "Orın bar", "Seats available"),
    ("m-legend-full", "Мест нет", "Orın joq", "Fully booked"),
    ("m-legend-none", "Нет экзамена", "Imtihan joq", "No exam"),
    ("m-pick-day", "Выберите жёлтый день в календаре.", "Kalendardan sarı kúndi tańlań.", "Pick a yellow day in the calendar."),
    ("m-sessions-on", "Время на {date}", "{date} kúngi waqıtlar", "Times on {date}"),
    ("m-seats-left", "Свободно: {n}", "Bos orın: {n}", "{n} seats free"),
    ("m-err-session", "Выберите день и время экзамена", "Imtihan kúni hám waqtın tańlań", "Please choose the exam day and time"),
    ("m-none-30", "В ближайшие 30 дней открытых дат нет. Позвоните нам:", "Jaqın 30 kúnde ashıq sáneler joq. Bizge qońıraw etiń:", "No open dates in the next 30 days. Call us:"),
    ("m-loading", "Загружаем расписание…", "Keste júklenbekte…", "Loading the schedule…"),
    ("m-load-fail", "Не удалось загрузить даты. Обновите страницу или позвоните нам:", "Sánelerdi júklew ámelge aspadı. Betti jańalań yamasa bizge qońıraw etiń:", "Could not load the dates. Refresh the page or call us:"),
    ("m-s3-title", "Проверьте и выберите оплату", "Tekseriń hám tólew usılın tańlań", "Check and choose how to pay"),
    ("m-s3-desc", "Оплату подтверждает администратор. До этого в билете будет «Ожидает оплаты».",
     "Tólemdi administrator tastıyıqlaydı. Oǵan shekem bilette «Tólem kútilmekte» dep jazıladı.",
     "An administrator confirms the payment. Until then your ticket shows \u201cAwaiting payment\u201d."),
    ("m-sum-name", "Кандидат", "Kandidat", "Candidate"),
    ("m-sum-exam", "Экзамен", "Imtihan", "Exam"),
    ("m-sum-date", "Дата и время", "Sáne hám waqıt", "Date and time"),
    ("m-sum-place", "Место", "Orın", "Location"),
    ("m-sum-total", "К оплате", "Tólewge", "To pay"),
    ("m-pay-title", "Как вам удобнее оплатить?", "Qalay tólew sizge qolaylı?", "How would you like to pay?"),
    ("m-pay-click-sub", "Перевод в приложении Click", "Click qosımshası arqalı awdarma", "Transfer in the Click app"),
    ("m-pay-payme-sub", "Перевод в приложении Payme", "Payme qosımshası arqalı awdarma", "Transfer in the Payme app"),
    ("m-pay-cash", "В центре", "Orayda", "At the centre"),
    ("m-pay-cash-sub", "Наличными до дня экзамена", "Imtihan kúnine shekem naq aqsha menen", "In cash before exam day"),
    ("m-submit", "Записаться на экзамен", "Imtihanǵa jazılıw", "Book the exam"),
    ("m-sending", "Записываем…", "Jazılmaqta…", "Booking…"),
    ("m-full", "Пока вы заполняли форму, места на это время закончились. Выберите другое.",
     "Siz forma toltırıp atırǵanda bul waqıtqa orınlar tawsıldı. Basqa waqıttı tańlań.",
     "Seats for this time ran out while you were filling in the form. Please choose another."),
    ("m-closed", "Запись на это время закрыта. Выберите другое.", "Bul waqıtqa jazılıw jabıldı. Basqa waqıttı tańlań.", "Booking for this time is closed. Please choose another."),
    ("m-fail", f"Не удалось записаться. Позвоните нам: {PHONE}", f"Jazılıw ámelge aspadı. Bizge qońıraw etiń: {PHONE}", f"Could not book. Please call us: {PHONE}"),
    ("m-method-click", "Click", "Click", "Click"),
    ("m-method-payme", "Payme", "Payme", "Payme"),
    ("m-method-cash", "наличные в центре", "orayda naq aqsha", "cash at the centre"),
    ("m-t-badge", "Вы записаны", "Siz jazıldıńız", "You're booked"),
    ("m-t-title", "Ваш билет на IELTS CD Mock", "IELTS CD Mock-qa biletińiz", "Your IELTS CD Mock ticket"),
    ("m-t-sub", "Сохраните номер билета: он нужен на входе и чтобы узнать результат.",
     "Bilet nomerin saqlap qoyıń: ol kiriwde hám nátiyjeni biliw ushın kerek.",
     "Keep your ticket number: you need it at the door and to check your result."),
    ("m-t-no", "Номер билета", "Bilet nomeri", "Ticket number"),
    ("m-t-pay", "Оплата", "Tólem", "Payment"),
    ("m-t-pending", "Ожидает оплаты · {method}", "Tólem kútilmekte · {method}", "Awaiting payment · {method}"),
    ("m-t-address", "Адрес", "Mánzil", "Address"),
    ("m-t-address-val", "ул. Н. Сараева 34, Нукус", "N. Saraev kóshesi 34, Nókis", "34 N. Sarayev St., Nukus"),
    ("m-t-print", "Распечатать", "Basıp shıǵarıw", "Print"),
    ("m-l-title", "Узнать результат Mock", "Mock nátiyjesin biliw", "Check your mock result"),
    ("m-l-desc", "Введите номер билета и телефон, указанный при записи.", "Bilet nomerin hám jazılǵanda kórsetken telefon nomerińizdi jazıń.", "Enter your ticket number and the phone you booked with."),
    ("m-l-ticket", "Номер билета", "Bilet nomeri", "Ticket number"),
    ("m-l-submit", "Показать результат", "Nátiyjeni kórsetiw", "Show result"),
    ("m-l-err", "Введите номер билета и телефон полностью", "Bilet nomeri hám telefondı tolıq jazıń", "Enter the ticket number and the full phone number"),
    ("m-l-notready", "Результат ещё не готов. Загляните позже — обычно через несколько дней после экзамена.",
     "Nátiyje ele tayın emes. Keyinirek qarań — ádette imtihannan bir neshe kún ótkennen soń tayın boladı.",
     "Your result isn't ready yet. Check back later, usually a few days after the exam."),
    ("m-l-notfound", "Билет с таким номером и телефоном не найден. Проверьте данные.",
     "Bunday nomer hám telefonlı bilet tabılmadı. Maǵlıwmatlardı tekseriń.",
     "No ticket found with this number and phone. Please check them."),
    ("m-l-limit", "Слишком много попыток. Попробуйте через час.", "Urınıwlar júdá kóp boldı. Bir saattan soń qaytadan kóriń.", "Too many attempts. Please try again in an hour."),
    ("m-l-fail", "Не удалось проверить. Попробуйте позже.", "Tekseriw ámelge aspadı. Keyinirek urınıp kóriń.", "Could not check. Please try again later."),
    ("m-l-hello", "{name}, ваш результат", "{name}, siziń nátiyjeńiz", "{name}, here is your result"),
    ("m-l-checking", "Проверяем…", "Tekserilmekte…", "Checking…"),
    ("m-err-gender", "Выберите пол", "Jınısıńızdı tańlań", "Please choose your gender"),
    ("m-err-phone", "Введите номер полностью: +998 и 9 цифр", "Nomerdi tolıq jazıń: +998 hám 9 san", "Enter the full number: +998 and 9 digits"),
    ("m-ticket-ph", "Например, ST-2026-MOCK-0001", "Mısalı, ST-2026-MOCK-0001", "For example, ST-2026-MOCK-0001"),
    ("m-l-again", "Проверить другой билет", "Basqa biletti tekseriw", "Check another ticket"),
]

# Calendar names (QQ only; RU and EN use the browser's built-in date names)
KAA_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"]
KAA_WEEKDAYS_SHORT = ["Du", "Si", "Sá", "Pi", "Ju", "Sh", "Ek"]  # Monday first
KAA_WEEKDAYS = ["dúyshembi", "siyshembi", "sárshembi", "piyshembi", "juma", "shembi", "ekshembi"]

keys = [r[0] for r in ROWS]
dupes = {k for k in keys if keys.count(k) > 1}
assert not dupes, dupes

data = {"ru": {}, "kaa": {}, "en": {}}
NBSP_DASH = "\u00a0\u2014"
for key, ru, kaa, en in ROWS:
    ru, kaa = ru.replace(" \u2014", NBSP_DASH), kaa.replace(" \u2014", NBSP_DASH)
    data["ru"][key], data["kaa"][key], data["en"][key] = ru, kaa, en

out = (
    "// Website texts in Russian (ru), Qaraqalpaqsha (kaa, Latin alphabet 2016) and English (en).\n"
    "// Used by index.html (main.js) and mock.html (mock.js) through i18n.js.\n"
    "// translations-kaa-review.md lists every string side by side for checking.\n"
    "window.TRANSLATIONS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    "window.KAA_CALENDAR = " + json.dumps({"months": KAA_MONTHS, "weekdaysShort": KAA_WEEKDAYS_SHORT, "weekdays": KAA_WEEKDAYS}, ensure_ascii=False) + ";\n"
)
open("translations.js", "w", encoding="utf-8", newline="\n").write(out)

# Review table for a native speaker
def cell(s):
    return s.replace("|", "\\|").replace("\n", " ")

lines = [
    "# Qaraqalpaqsha translations: review list",
    "",
    "Every text on the website (index.html and mock.html) in Russian and Qaraqalpaqsha (Latin alphabet, 2016).",
    "Please check the right column. Words in {curly brackets} are filled in by the site (a number, date or name) and must stay as they are.",
    "To fix a translation, change it in `translations.js` (the `kaa` block).",
    "",
    "| # | Русский | Qaraqalpaqsha |",
    "|---|---|---|",
]
for i, (key, ru, kaa, en) in enumerate(ROWS, 1):
    lines.append(f"| {i} | {cell(ru)} | {cell(kaa)} |")
lines += [
    "",
    "## Calendar (mock.html)",
    "",
    "| Русский | Qaraqalpaqsha |",
    "|---|---|",
    "| январь … декабрь | " + ", ".join(KAA_MONTHS) + " |",
    "| пн, вт, ср, чт, пт, сб, вс | " + ", ".join(KAA_WEEKDAYS_SHORT) + " |",
    "| понедельник … воскресенье | " + ", ".join(KAA_WEEKDAYS) + " |",
    "",
]
open("translations-kaa-review.md", "w", encoding="utf-8", newline="\n").write("\n".join(lines))

# Sanity: no Cyrillic in kaa, no Uzbek apostrophe letters
import re
for key, ru, kaa, en in ROWS:
    assert not re.search(r"[\u0400-\u04FF]", kaa), (key, kaa)
    assert not re.search(r"[oOgG][\u02bb\u2018'`]", kaa), (key, kaa)
print(len(ROWS), "keys written")
