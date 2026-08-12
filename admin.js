// ============================================================
// STEP 1: Paste your own Supabase Project URL and anon public key here.
// Find these in Supabase: Project Settings > API
// The page will not work until both of these are real values.
// ============================================================
const SUPABASE_URL = "https://nzbravxsxttloyicwcyq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56YnJhdnhzeHR0bG95aWN3Y3lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNTg3NzAsImV4cCI6MjEwMTgzNDc3MH0.YFZfZRWHTAvxTYRDcmokgpvmjT9iflpA4KGJMcnMrFY";

if (SUPABASE_URL.includes("PASTE_YOUR") || SUPABASE_ANON_KEY.includes("PASTE_YOUR")) {
  document.getElementById('app').innerHTML =
    '<div class="card">' +
    '<strong>Setup needed:</strong> open admin.js and paste your real Supabase ' +
    'Project URL and anon public key at the top of the file (Supabase dashboard → ' +
    'Project Settings → API).' +
    '</div>';
  throw new Error("Supabase credentials not configured yet — see admin.js");
}

// NOTE: named supabaseClient (not "supabase") because the Supabase CDN
// script already defines a global called "supabase" — reusing that name
// causes "Identifier 'supabase' has already been declared".
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById('app');

let session = null; // { email, role }

async function login(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Login failed: " + error.message);
    return;
  }
  // Look up this person's role in the staff_roles table
  const { data: roleRow, error: roleError } = await supabaseClient
    .from('staff_roles')
    .select('role')
    .eq('email', email)
    .single();

  if (roleError || !roleRow) {
    alert("You logged in, but you're not listed in staff_roles. Ask the owner to add you.");
    await supabaseClient.auth.signOut();
    return;
  }

  session = { email, role: roleRow.role };
  render();
}

async function logout() {
  await supabaseClient.auth.signOut();
  session = null;
  render();
}

async function loadNews() {
  const { data, error } = await supabaseClient
    .from('news')
    .select('*')
    .order('created_at', { ascending: false });
  return error ? [] : data;
}

async function addNews(title, body) {
  await supabaseClient.from('news').insert([{ title, body }]);
  render();
}

async function deleteNews(id) {
  await supabaseClient.from('news').delete().eq('id', id);
  render();
}

function loginScreen() {
  app.innerHTML = `
    <div class="card">
      <label>Email</label>
      <input id="email" type="email" placeholder="you@stanfordnukus.uz" />
      <label>Password</label>
      <input id="password" type="password" />
      <button id="loginBtn">Log in</button>
    </div>
  `;
  document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    login(email, password);
  });
}

async function dashboard() {
  const news = await loadNews();
  app.innerHTML = `
    <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
      <span>Logged in as <strong>${session.email}</strong> · role: ${session.role}</span>
      <button id="logoutBtn">Log out</button>
    </div>
    <div class="card">
      <label>Title</label>
      <input id="newTitle" placeholder="e.g. Autumn IELTS intake open" />
      <label>Details</label>
      <textarea id="newBody" rows="3"></textarea>
      <button id="addBtn">Publish</button>
    </div>
    <div class="card">
      <div class="muted" style="margin-bottom:10px;">Published news</div>
      ${news.map(n => `
        <div class="post">
          <strong>${n.title}</strong>
          <div class="muted">${new Date(n.created_at).toLocaleDateString()}</div>
          <div>${n.body}</div>
          ${session.role === 'owner' ? `<button data-id="${n.id}" class="delBtn" style="background:none; color:#999; font-weight:400; padding:0; margin-top:6px;">Remove</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('addBtn').addEventListener('click', () => {
    const title = document.getElementById('newTitle').value.trim();
    const body = document.getElementById('newBody').value.trim();
    if (title) addNews(title, body);
  });
  app.querySelectorAll('.delBtn').forEach(btn => {
    btn.addEventListener('click', () => deleteNews(Number(btn.dataset.id)));
  });
}

function render() {
  session ? dashboard() : loginScreen();
}

render();
