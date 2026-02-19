/* Bright Waves LMS (multi-page)
   Persistence: Cloudflare KV via Pages Functions under /api/*
   Auth: token in sessionStorage, sent as Authorization: Bearer <token>
*/

const BW_BASE = window.__BW_BASE_PATH || '';

const API = {
  async request(path, opts = {}) {
    const url = (path.startsWith('http') ? path : (BW_BASE + path));
    const token = sessionStorage.getItem('bw_token') || '';
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {},
      token ? { 'Authorization': `Bearer ${token}` } : {}
    );
    const res = await fetch(url, { ...opts, headers });
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body || {}) }); },
  put(path, body) { return this.request(path, { method: 'PUT', body: JSON.stringify(body || {}) }); },
};


function escapeHtml(input) {
  const s = (input ?? "").toString();
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function qs(name) { return new URLSearchParams(location.search).get(name); }

async function guard() {
  const token = sessionStorage.getItem('bw_token');
  if (!token) { location.href = 'index.html'; return null; }
  try {
    const me = await API.get('/api/me');
    return me;
  } catch {
    sessionStorage.removeItem('bw_token');
    location.href = 'index.html';
    return null;
  }
}

function showOverlay(title, subtitle, ms = 1800) {
  const o = document.getElementById('welcomeOverlay');
  if (!o) return;
  document.getElementById('welcomeTitle').textContent = title;
  document.getElementById('welcomeSubtitle').textContent = subtitle;
  o.classList.remove('hidden');
  clearTimeout(window.__bwOverlayTimer);
  window.__bwOverlayTimer = setTimeout(() => o.classList.add('hidden'), ms);
}

async function topbarInit(me) {
  const info = document.getElementById('currentUserInfo');
  const logoutBtn = document.getElementById('logoutBtn');
  const pretty = me.roles.map(r => r === 'cs' ? 'Customer Service' : (r === 'instructor' ? 'Instructor' : (r === 'it' ? 'IT' : 'Admin'))).join(', ');
  if (info) info.textContent = `${me.name} • ${pretty}`;
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await API.post('/api/logout'); } catch {}
      sessionStorage.removeItem('bw_token');
      location.href = 'index.html';
    });
  }

  const seen = sessionStorage.getItem('bw_welcome_seen') || '0';
  if (seen !== '1') {
    sessionStorage.setItem('bw_welcome_seen', '1');
    showOverlay(`Welcome, ${me.name.split(' ')[0]}`, `We're excited to have you on board. Let's get started.`, 2200);
  }

  const overlay = document.getElementById('welcomeOverlay');
  const cont = document.getElementById('welcomeContinueBtn');
  if (cont) cont.addEventListener('click', () => overlay.classList.add('hidden'));
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
}

async function loginPageInit() {
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('error');
  const u = document.getElementById('username');
  const p = document.getElementById('password');

  async function doLogin() {
    err.textContent = '';
    try {
      const out = await API.post('/api/login', { username: u.value.trim(), password: p.value });
      if (out.forceReset) { sessionStorage.setItem('bw_token', out.token); location.href='set-password.html'; return; }
      sessionStorage.setItem('bw_token', out.token);
      sessionStorage.setItem('bw_welcome_seen', '0');
      location.href = 'dashboard.html';
    } catch (e) {
      err.textContent = e.message || 'Login failed';
    }
  }

  btn.addEventListener('click', doLogin);
  u.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

async function dashboardInit() {
  const me = await guard(); if (!me) return;
  await topbarInit(me);

  const trainingTabBtn = document.getElementById('trainingTabBtn');
  const adminTabBtn = document.getElementById('adminTabBtn');
  const itTabBtn = document.getElementById('itTabBtn');  const trainingTab = document.getElementById('trainingTab');
  const adminTab = document.getElementById('adminTab');
  const itTab = document.getElementById('itTab');

  let __bwItToolsLoaded = false;

  function switchTab(tab) {
    trainingTab.classList.add('hidden');
    adminTab.classList.add('hidden');
    if (itTab) itTab.classList.add('hidden');
    trainingTabBtn.classList.remove('active');
    adminTabBtn.classList.remove('active');
    if (tab === 'training') { trainingTab.classList.remove('hidden'); trainingTabBtn.classList.add('active'); }
    if (tab === 'admin') { adminTab.classList.remove('hidden'); adminTabBtn.classList.add('active'); }
    if (tab === 'it' && itTab) { itTab.classList.remove('hidden'); itTabBtn.classList.add('active'); }
  }

  if (me.roles.includes('admin') || me.roles.includes('it')) {
    adminTabBtn.classList.remove('hidden');
  } else {
    adminTabBtn.classList.add('hidden');
  }

  if (itTabBtn) {
    if (me.roles.includes('it')) {
      itTabBtn.classList.remove('hidden');
    } else {
      itTabBtn.classList.add('hidden');
    }
  }
trainingTabBtn.addEventListener('click', () => switchTab('training'));
  adminTabBtn.addEventListener('click', () => switchTab('admin'));
  if (itTabBtn) itTabBtn.addEventListener('click', async () => {
    switchTab('it');
    if (!__bwItToolsLoaded) {
      __bwItToolsLoaded = true;
      try { await itToolsInitInline(); } catch(e) { console.error(e); }
    }
  });
  switchTab('training');

  const [mods, prog] = await Promise.all([API.get('/api/modules'), API.get('/api/progress')]);
  const accessible = mods.filter(m => m.roles.some(r => me.roles.includes(r)));
  const completed = accessible.filter(m => prog.progress[m.id]).length;
  const percent = accessible.length ? Math.round((completed / accessible.length) * 100) : 0;

  document.getElementById('progressFill').style.width = percent + '%';
  document.getElementById('progressText').textContent = `${percent}% Complete`;
  document.getElementById('progressCount').textContent = `${completed} / ${accessible.length} modules`;

  const introDone = !!prog.progress['introduction'];

  const list = document.getElementById('moduleList');
  list.innerHTML = '';
  accessible
    .slice()
    .sort((a,b)=> (a.id==='introduction'?-1:(b.id==='introduction'?1:a.title.localeCompare(b.title))))
    .forEach(m => {
      const locked = m.id !== 'introduction' && !introDone;
      const done = !!prog.progress[m.id];
      const badge = done ? `<span class="badge done">DONE</span>` : (locked ? `<span class="badge lock">LOCKED</span>` : `<span class="badge pending">PENDING</span>`);
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div>
          <strong>${m.title}</strong>
          <p style="margin:4px 0 0">${locked ? 'Complete Introduction to unlock.' : (done ? 'Completed.' : 'Ready to start.')}</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          ${badge}
          <button ${locked ? 'disabled' : ''} data-open="${m.id}">Open</button>
        </div>
      `;
      row.querySelector('[data-open]')?.addEventListener('click', () => {
        location.href = `module.html?id=${encodeURIComponent(m.id)}`;
      });
      list.appendChild(row);
    });

  if (me.roles.includes('admin') || me.roles.includes('it')) {
    await adminPanelInitInline(mods);
  }
}

async function moduleInit() {
  const me = await guard(); if (!me) return;
  await topbarInit(me);

  const moduleId = qs('id');
  if (!moduleId) { location.href = 'dashboard.html'; return; }

  const access = await API.get(`/api/module-access?id=${encodeURIComponent(moduleId)}`);
  if (!access.ok) {
    showOverlay('Access blocked', access.reason || 'You cannot access this module.', 2200);
    setTimeout(() => location.href = 'dashboard.html', 600);
    return;
  }

  await API.post('/api/view', { moduleId });

  const mods = await API.get('/api/modules');
  const m = mods.find(x => x.id === moduleId);
  if (!m) { location.href = 'dashboard.html'; return; }

  const prog = await API.get('/api/progress');
  const acknowledged = !!prog.ack[moduleId];

  const host = document.getElementById('pageHost');
  host.innerHTML = '';


  // Custom modules created via IT Tools (multi-page, rich content)
  if (m.custom) {
    // apply style if provided
    const style = m.style || {};
    const fontFamily = style.fontFamily || "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const baseFontPx = Number(style.baseFontPx || 16);
    const textColor = style.textColor || "#0f172a";
    const accentColor = style.accentColor || "var(--primary)";

    const pages = Array.isArray(m.pages) && m.pages.length ? m.pages : [{
      id: "p1", type: "richtext", title: m.title, html: (m.content || "").replaceAll("\n","<br>")
    }];

    let pageIdx = 0;

    const renderPage = () => {
      const p = pages[pageIdx];
      const card = document.createElement('div');
      card.className = 'card';
      card.style.fontFamily = fontFamily;
      card.style.fontSize = `${baseFontPx}px`;
      card.style.color = textColor;

      const header = `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
          <div>
            <h2 style="margin:0;color:${accentColor}">${escapeHtml(m.title)}</h2>
            <div class="muted" style="margin-top:6px">${escapeHtml(p.title || '')}</div>
          </div>
          <div class="muted">${pageIdx+1} / ${pages.length}</div>
        </div>
        <div class="progress" style="margin-top:12px"><div class="bar" style="width:${Math.round(((pageIdx+1)/pages.length)*100)}%"></div></div>
      `;

      let body = '';
      if (p.type === 'media') {
        const u = p.url || '';
        if ((p.mediaType || 'image') === 'video') {
          body = `<div style="margin-top:14px">
            <div style="position:relative;padding-top:56.25%;border-radius:14px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.7)">
              <iframe src="${escapeHtml(u)}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
            ${p.caption ? `<div class="muted" style="margin-top:10px">${escapeHtml(p.caption)}</div>` : ``}
          </div>`;
        } else {
          body = `<div style="margin-top:14px">
            <img src="${escapeHtml(u)}" alt="" style="width:100%;max-height:520px;object-fit:contain;border-radius:14px;border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.7)">
            ${p.caption ? `<div class="muted" style="margin-top:10px">${escapeHtml(p.caption)}</div>` : ``}
          </div>`;
        }
      } else {
        body = `<div style="margin-top:14px">${p.html || ''}</div>`;
      }

      const nav = document.createElement('div');
      nav.className = 'row';
      nav.style.marginTop = '14px';
      nav.innerHTML = `
        <div><button class="secondary" id="custBack" style="width:100%" ${pageIdx===0?'disabled':''}>Back</button></div>
        <div><button id="custNext" style="width:100%">${pageIdx===pages.length-1 ? (m.quiz ? 'Acknowledge & Start Quiz' : 'Acknowledge & Finish') : 'Next'}</button></div>
      `;

      card.innerHTML = header + body;
      host.innerHTML = '';
      host.appendChild(card);
      host.appendChild(nav);

      nav.querySelector('#custBack').addEventListener('click', () => {
        if (pageIdx>0) { pageIdx--; renderPage(); }
      });

      nav.querySelector('#custNext').addEventListener('click', async () => {
        if (pageIdx < pages.length-1) { pageIdx++; renderPage(); return; }
        // last page: acknowledge
        await API.post('/api/ack', { moduleId });
        if (m.quiz) {
          location.href = `quiz.html?id=${encodeURIComponent(moduleId)}`;
        } else {
          await API.post('/api/complete-module', { moduleId });
          showOverlay('Completed', 'Module completed.', 1400);
          setTimeout(() => location.href = 'dashboard.html', 450);
        }
      });
    };

    renderPage();
    return;
  }  if (m.id === 'vision') {
    const wrap = document.createElement('div');
    wrap.className = 'card vision-shell';
    wrap.innerHTML = `
      <div class="vision-grid">
        <div class="vision-left">
          <div class="vision-left-inner">
            <p class="vision-kicker">Our Vision</p>
            <p class="vision-text">Create a lifelong love of the water</p>

            <p class="vision-kicker">Our Mission</p>
            <p class="vision-par">To inspire and encourage our communities to become swimmers who succeed and thrive in all aquatic environments.</p>

            <p class="purpose-title">Our Purpose</p>
            <div class="purpose-item">
              <p class="purpose-word pw-inspire">Inspire</p>
              <p class="purpose-sub">Leading by example</p>
            </div>
            <div class="purpose-item">
              <p class="purpose-word pw-encourage">Encourage</p>
              <p class="purpose-sub">It’s all about our people</p>
            </div>
            <div class="purpose-item">
              <p class="purpose-word pw-succeed">Succeed</p>
              <p class="purpose-sub">Positive outcomes</p>
            </div>

            <div class="vision-actions">
              <button id="ackBtn">${acknowledged ? 'Acknowledged ✅' : 'Acknowledge'}</button>
              <button class="secondary" id="backBtn">Back to Modules</button>
            </div>

            ${acknowledged ? `<div style="margin-top:12px"><button class="ghost" id="startQuizBtn" style="width:100%">Start Quiz</button></div>` : ``}
          </div>
        </div>

        <div class="vision-right"></div>
      </div>
    `;
    host.appendChild(wrap);

    wrap.querySelector('#backBtn').addEventListener('click', () => location.href = 'dashboard.html');
    wrap.querySelector('#ackBtn').addEventListener('click', async () => {
      if (!acknowledged) {
        await API.post('/api/ack', { moduleId });
        location.reload();
      }
    });
    wrap.querySelector('#startQuizBtn')?.addEventListener('click', () => location.href = `quiz.html?id=${encodeURIComponent(moduleId)}`);
    return;
  }

  if (m.type === 'intro') {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `
      <h2 style="color:var(--primary)">${m.title}</h2>
      <p style="white-space:pre-line">${m.content}</p>
      <div class="row" style="margin-top:14px">
        <div><button id="introAckBtn" style="width:100%">Acknowledge & Continue</button></div>
        <div><button class="secondary" id="backBtn" style="width:100%">Back to Modules</button></div>
      </div>
    `;
    host.appendChild(wrap);
    wrap.querySelector('#backBtn').addEventListener('click', () => location.href = 'dashboard.html');
    wrap.querySelector('#introAckBtn').addEventListener('click', async () => {
      await API.post('/api/complete-intro');
      showOverlay('Welcome aboard!', 'Introduction completed — training unlocked.', 1600);
      setTimeout(() => location.href = 'dashboard.html', 450);
    });
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `
    <h2 style="color:var(--primary)">${m.title}</h2>
    <p>${m.content || ''}</p>

    <div class="item" style="background:#fff">
      <div>
        <strong>Policy acknowledgement</strong>
        <p style="margin:4px 0 0">Acknowledge before attempting the quiz.</p>
      </div>
      <button id="ackBtn">${acknowledged ? 'Acknowledged ✅' : 'Acknowledge'}</button>
    </div>

    ${acknowledged ? `<div style="margin-top:12px"><button class="ghost" id="startQuizBtn" style="width:100%">Start Quiz</button></div>` : ``}

    <div class="row" style="margin-top:14px">
      <div><button class="secondary" id="backBtn" style="width:100%">Back to Modules</button></div>
    </div>
  `;
  host.appendChild(wrap);

  wrap.querySelector('#backBtn').addEventListener('click', () => location.href = 'dashboard.html');
  wrap.querySelector('#ackBtn').addEventListener('click', async () => {
    if (!acknowledged) {
      await API.post('/api/ack', { moduleId });
      location.reload();
    }
  });
  wrap.querySelector('#startQuizBtn')?.addEventListener('click', () => location.href = `quiz.html?id=${encodeURIComponent(moduleId)}`);
}

async function quizInit() {
  const me = await guard(); if (!me) return;
  await topbarInit(me);

  const moduleId = qs('id');
  if (!moduleId) { location.href = 'dashboard.html'; return; }

  const elig = await API.get(`/api/quiz-eligibility?id=${encodeURIComponent(moduleId)}`);
  if (!elig.ok) {
    showOverlay('Quiz blocked', elig.reason || 'You cannot start this quiz.', 2400);
    setTimeout(() => location.href = `module.html?id=${encodeURIComponent(moduleId)}`, 700);
    return;
  }

  const mods = await API.get('/api/modules');
  const m = mods.find(x => x.id === moduleId);
  if (!m || !m.quiz) { location.href = 'dashboard.html'; return; }

  // New quiz schema (multi-question)
  if (m.quiz.questions && Array.isArray(m.quiz.questions)) {
    const host = document.getElementById('pageHost');
    host.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `
      <h2 style="color:var(--primary)">${escapeHtml(m.title)} – Quiz</h2>
      <p class="muted" style="margin-bottom:12px">You must score 100% to pass.</p>
      <div id="quizQs"></div>
      <div class="row" style="margin-top:14px">
        <div><button class="secondary" id="quizBackBtn" style="width:100%">Back</button></div>
        <div><button id="quizSubmitBtn" style="width:100%">Submit</button></div>
      </div>
      <div class="error" id="quizErr"></div>
    `;
    host.appendChild(wrap);

    const qsHost = wrap.querySelector('#quizQs');
    const err = wrap.querySelector('#quizErr');

    // render questions with randomized answer order
    const rendered = m.quiz.questions.map((q, qi) => {
      const answers = (q.answers || []).map(a => ({...a}));
      for (let i = answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [answers[i], answers[j]] = [answers[j], answers[i]];
      }
      const qWrap = document.createElement('div');
      qWrap.className = 'it-card';
      qWrap.style.marginBottom = '12px';
      qWrap.innerHTML = `
        <div style="font-weight:900;margin-bottom:8px">${qi+1}. ${escapeHtml(q.prompt)}</div>
        <div class="progress-list" style="margin-top:0"></div>
      `;
      const list = qWrap.querySelector('.progress-list');
      answers.forEach(a => {
        const lab = document.createElement('label');
        lab.className = 'quiz-opt';
        lab.style.display='flex';
        lab.style.gap='10px';
        lab.style.alignItems='center';
        lab.style.padding='8px 10px';
        lab.style.borderRadius='12px';
        lab.style.border='1px solid rgba(0,0,0,0.08)';
        lab.style.background='rgba(255,255,255,0.75)';
        lab.innerHTML = `<input type="radio" name="q${qi}" value="${escapeHtml(a.id)}"> <span>${escapeHtml(a.text)}</span>`;
        list.appendChild(lab);
      });
      qsHost.appendChild(qWrap);
      return { q, answers };
    });

    wrap.querySelector('#quizBackBtn').addEventListener('click', () => {
      location.href = `module.html?id=${encodeURIComponent(moduleId)}`;
    });

    wrap.querySelector('#quizSubmitBtn').addEventListener('click', async () => {
      err.textContent='';
      const picked = rendered.map((_, qi) => wrap.querySelector(`input[name="q${qi}"]:checked`)?.value || null);
      if (picked.some(v => !v)) { err.textContent = 'Please answer every question.'; return; }

      let correct = 0;
      rendered.forEach((r, qi) => {
        if (picked[qi] === r.q.correctAnswerId) correct++;
      });
      const score = Math.round((correct / rendered.length) * 100);

      if (score === 100) {
        await API.post('/api/complete-module', { moduleId });
        showOverlay('Nice work!', 'Quiz passed — module completed.', 1500);
        setTimeout(() => location.href = 'dashboard.html', 450);
      } else {
        err.textContent = `You must score 100% to pass. You scored ${score}%. Try again.`;
      }
    });

    return;
  }


  const indices = m.quiz.opts.map((_, idx) => idx);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const correctDisplayIdx = indices.indexOf(m.quiz.a);

  const host = document.getElementById('pageHost');
  host.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = `
    <h2 style="color:var(--primary)">${m.title} – Quiz</h2>
    <p style="margin-bottom:12px">${m.quiz.q}</p>
    <div id="quizBtns" class="list"></div>
    <div class="row" style="margin-top:16px">
      <div><button class="secondary" id="backBtn" style="width:100%">Back to Module</button></div>
    </div>
  `;
  host.appendChild(wrap);

  wrap.querySelector('#backBtn').addEventListener('click', () => location.href = `module.html?id=${encodeURIComponent(moduleId)}`);

  const btnHost = wrap.querySelector('#quizBtns');
  indices.forEach((origIdx, displayIdx) => {
    const b = document.createElement('button');
    b.className = 'ghost';
    b.style.width = '100%';
    b.textContent = m.quiz.opts[origIdx];
    b.addEventListener('click', async () => {
      if (displayIdx === correctDisplayIdx) {
        await API.post('/api/complete-module', { moduleId });
        showOverlay('Nice work!', 'Quiz passed — module completed.', 1500);
        setTimeout(() => location.href = 'dashboard.html', 450);
      } else {
        showOverlay('Not quite', 'Incorrect. Try again — answers reshuffled.', 1400);
        setTimeout(() => location.reload(), 350);
      }
    });
    btnHost.appendChild(b);
  });
}

async function adminPageInit() {
  const me = await guard(); if (!me) return;
  if (!(me.roles.includes('admin') || me.roles.includes('it'))) { location.href = 'dashboard.html'; return; }
  await topbarInit(me);
  await adminPanelInitStandalone();
}

async function adminPanelInitInline() {
  const adminTab = document.getElementById('adminTab');
  const itTab = document.getElementById('itTab');

  let __bwItToolsLoaded = false;
  if (!adminTab) return;
  adminTab.innerHTML = `<div id="adminMount"></div>`;
  await adminPanelWire(document.getElementById('adminMount'));
}

async function adminPanelInitStandalone() {
  const host = document.getElementById('pageHost');
  host.innerHTML = `
    <div class="topbar" style="margin-bottom:14px">
      <div class="brand"><div class="logo"></div><div><h2 style="margin:0;color:var(--primary)">Admin Panel</h2><small>Manage accounts & track progress</small></div></div>
      <div><button class="secondary" onclick="location.href='dashboard.html'">Back to Dashboard</button></div>
    </div>
    <div id="adminMount"></div>
  `;
  await adminPanelWire(document.getElementById('adminMount'));
}

async function adminPanelWire(mount) {
  const me = await API.get('/api/me');
  mount.innerHTML = `
    <div class="grid">
      <div class="card">
        <h3>User List</h3>
        <p style="margin-top:0">Click a user to view/edit their account and progress.</p>
        <input id="userSearch" class="user-search" placeholder="Search users…" />
        <div id="userList" class="list" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <h3 id="adminRightTitle">Create New User</h3>
        <div id="createUserPanel">
          <input id="newName" placeholder="Full Name" />
          <div class="row">
            <div><input id="newUsername" placeholder="Username" /></div>
            <div><input id="newPassword" placeholder="Password" /></div>
          </div>
          <div style="margin:8px 0 12px">
            <label style="font-size:12px;color:var(--muted);font-weight:900">Roles (tick all that apply)</label>
            <div class="card" style="padding:12px;margin:8px 0 0;background:rgba(240,249,255,0.55);border:1px solid rgba(0,180,216,0.18)">
              <div class="role-list">
                <div class="role-item"><div class="left"><input type="checkbox" id="newRoleAdmin"><span>Admin</span></div></div>
                <div class="role-item"><div class="left"><input type="checkbox" id="newRoleInstructor" checked><span>Instructor</span></div></div>
                <div class="role-item"><div class="left"><input type="checkbox" id="newRoleCS"><span>Customer Service</span></div></div>
                <div class="role-item"><div class="left"><input type="checkbox" id="newRoleIT"><span>IT</span></div></div>
              </div>
            </div>
          </div>
          <button id="createUserBtn" style="width:100%">Create User</button>
        </div>

        <div id="editUserPanel" class="hidden">
          <div class="item" style="background:#fff">
            <div>
              <strong id="editUserName">User</strong>
              <p id="editUserMeta" style="margin:4px 0 0">—</p>
            </div>
            <span id="editUserBadge" class="badge pending">USER</span>
          </div>

          <div class="row" style="margin-top:10px">
            <div>
              <label style="font-size:12px;color:var(--muted);font-weight:900">Full Name</label>
              <input id="editName" placeholder="Full Name" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--muted);font-weight:900">Username</label>
              <input id="editUsername" placeholder="Username" />
            </div>
          </div>

          <div class="row">
            <div>
              <label style="font-size:12px;color:var(--muted);font-weight:900">Password</label>
              <input id="editPassword" placeholder="Password" />
            </div>
            <div>
              <label style="font-size:12px;color:var(--muted);font-weight:900">Roles</label>
              <div class="card" style="padding:12px;margin:8px 0 0;background:rgba(240,249,255,0.55);border:1px solid rgba(0,180,216,0.18)">
                <div class="role-list">
                <div class="role-item"><div class="left"><input type="checkbox" id="editRoleAdmin"><span>Admin</span></div></div>
                <div class="role-item"><div class="left"><input type="checkbox" id="editRoleInstructor"><span>Instructor</span></div></div>
                <div class="role-item"><div class="left"><input type="checkbox" id="editRoleCS"><span>Customer Service</span></div></div>
                <div class="role-item"><div class="left"><input type="checkbox" id="editRoleIT"><span>IT</span></div></div>
              </div>
              </div>
            </div>
          </div>

          <div class="card" style="padding:16px;background:rgba(240,249,255,0.55);border:1px solid rgba(0,180,216,0.18)">
            <strong>Progress for this user</strong>
            <div class="progress-wrap">
              <div class="progress-bar"><div id="adminProgressFill" class="progress-fill"></div></div>
            </div>
            <div class="kpi">
              <small id="adminProgressText">0% Complete</small>
              <small id="adminProgressCount">0 / 0 modules</small>
            </div>
            <div id="adminProgressList" class="list" style="margin-top:10px"></div>
          </div>

          <div class="row">
            <div><button id="saveUserBtn" style="width:100%">Save Changes</button></div>
            <div><button class="danger" id="resetProgressBtn" style="width:100%">Reset Progress</button></div>
          </div>

          <button class="ghost" id="backToCreateBtn" style="width:100%;margin-top:10px">Back to Create User</button>
        </div>
      </div>
    </div>
  `;

  // Admins cannot assign or edit IT role/accounts (IT role manages itself)
  const canManageIT = me.roles.includes('it');
  // Hide IT role checkboxes if not IT
  const itNew = mount.querySelector('#newRoleIT');
  if (itNew && !canManageIT) itNew.closest('.role-item')?.classList.add('hidden');
  const itEdit = mount.querySelector('#editRoleIT');
  if (itEdit && !canManageIT) itEdit.closest('.role-item')?.classList.add('hidden');

  const els = {
    userList: mount.querySelector('#userList'),
    userSearch: mount.querySelector('#userSearch'),
    adminRightTitle: mount.querySelector('#adminRightTitle'),
    createUserPanel: mount.querySelector('#createUserPanel'),
    editUserPanel: mount.querySelector('#editUserPanel'),

    newName: mount.querySelector('#newName'),
    newUsername: mount.querySelector('#newUsername'),
    newPassword: mount.querySelector('#newPassword'),
    newRoleAdmin: mount.querySelector('#newRoleAdmin'),
    newRoleInstructor: mount.querySelector('#newRoleInstructor'),
    newRoleCS: mount.querySelector('#newRoleCS'),
    newRoleIT: mount.querySelector('#newRoleIT'),
    createUserBtn: mount.querySelector('#createUserBtn'),

    editUserName: mount.querySelector('#editUserName'),
    editUserMeta: mount.querySelector('#editUserMeta'),
    editUserBadge: mount.querySelector('#editUserBadge'),
    editName: mount.querySelector('#editName'),
    editUsername: mount.querySelector('#editUsername'),
    editPassword: mount.querySelector('#editPassword'),
    editRoleAdmin: mount.querySelector('#editRoleAdmin'),
    editRoleInstructor: mount.querySelector('#editRoleInstructor'),
    editRoleCS: mount.querySelector('#editRoleCS'),
    editRoleIT: mount.querySelector('#editRoleIT'),

    adminProgressFill: mount.querySelector('#adminProgressFill'),
    adminProgressText: mount.querySelector('#adminProgressText'),
    adminProgressCount: mount.querySelector('#adminProgressCount'),
    adminProgressList: mount.querySelector('#adminProgressList'),

    saveUserBtn: mount.querySelector('#saveUserBtn'),
    resetProgressBtn: mount.querySelector('#resetProgressBtn'),
    backToCreateBtn: mount.querySelector('#backToCreateBtn'),
  };
  if (els.userSearch) els.userSearch.addEventListener('input', () => refreshList());


  let selectedUserId = null;

  function rolesFrom(prefix) {
    const roles = [];
    const a = prefix === 'new' ? els.newRoleAdmin : els.editRoleAdmin;
    const i = prefix === 'new' ? els.newRoleInstructor : els.editRoleInstructor;
    const c = prefix === 'new' ? els.newRoleCS : els.editRoleCS;
    const t = prefix === 'new' ? els.newRoleIT : els.editRoleIT;
    if (a.checked) roles.push('admin');
    if (i.checked) roles.push('instructor');
    if (c.checked) roles.push('cs');
    if (t && t.checked) roles.push('it');
    return roles;
  }
  function prettyRoles(roles) {
    return roles.map(r => r === 'cs' ? 'Customer Service' : (r === 'instructor' ? 'Instructor' : (r === 'it' ? 'IT' : 'Admin'))).join(', ');
  }

  async function refreshList() {
    const out = await API.get('/api/admin/users');
    els.userList.innerHTML = '';
    const q = (els.userSearch?.value || '').toLowerCase().trim();
    let users = q ? out.users.filter(u => (u.name||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q)) : out.users;
    if (!me.roles.includes('it')) users = users.filter(u => !(u.roles||[]).includes('it'));
    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div>
          <strong>${u.name}</strong>
          <p style="margin:4px 0 0">${prettyRoles(u.roles)} • ${u.progressPercent}% complete</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="badge pending">${u.roles.includes('admin') ? 'ADMIN' : 'USER'}</span>
          <button data-open="${u.id}">Open</button>
        </div>
      `;
      row.querySelector('[data-open]')?.addEventListener('click', () => openEditor(u.id));
      els.userList.appendChild(row);
    });
  }

  function showCreate() {
    selectedUserId = null;
    els.adminRightTitle.textContent = 'Create New User';
    els.createUserPanel.classList.remove('hidden');
    els.editUserPanel.classList.add('hidden');
  }

  async function openEditor(id) {
    selectedUserId = id;
    els.adminRightTitle.textContent = 'Edit User';
    els.createUserPanel.classList.add('hidden');
    els.editUserPanel.classList.remove('hidden');

    const out = await API.get(`/api/admin/users?id=${encodeURIComponent(id)}`);
    const u = out.user;

    els.editUserName.textContent = u.name;
    els.editUserMeta.textContent = `${prettyRoles(u.roles)} • username: ${u.username}`;
    els.editUserBadge.textContent = u.roles.includes('admin') ? 'ADMIN' : 'USER';

    els.editName.value = u.name;
    els.editUsername.value = u.username;
    els.editPassword.value = ''; els.editPassword.placeholder = 'Leave blank to keep unchanged';

    els.editRoleAdmin.checked = u.roles.includes('admin');
    els.editRoleInstructor.checked = u.roles.includes('instructor');
    els.editRoleCS.checked = u.roles.includes('cs');

    els.adminProgressFill.style.width = u.progressPercent + '%';
    els.adminProgressText.textContent = `${u.progressPercent}% Complete`;
    els.adminProgressCount.textContent = `${u.completed} / ${u.total} modules`;
    els.adminProgressList.innerHTML = '';
    u.modules.forEach(m => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div><strong>${m.title}</strong><p style="margin:4px 0 0">${m.done ? 'Completed' : 'Not completed'}</p></div>
        <span class="badge ${m.done ? 'done' : 'pending'}">${m.done ? 'DONE' : 'PENDING'}</span>
      `;
      els.adminProgressList.appendChild(row);
    });
  }

  els.createUserBtn.addEventListener('click', async () => {
    const name = els.newName.value.trim();
    const username = els.newUsername.value.trim();
    const password = els.newPassword.value;
    const roles = rolesFrom('new');
    if (!name || !username) return showOverlay('Missing info', 'Name and username are required.', 1800);
    if (!roles.length) return showOverlay('Select roles', 'Tick at least one role.', 1800);
    await API.post('/api/admin/users', { name, username, password, roles });
    els.newName.value=''; els.newUsername.value=''; els.newPassword.value='';
    els.newRoleAdmin.checked=false; els.newRoleInstructor.checked=true; els.newRoleCS.checked=false;
    await refreshList();
    showOverlay('Created', 'New user created.', 1400);
  });

  els.saveUserBtn.addEventListener('click', async () => {
    if (!selectedUserId) return;
    const name = els.editName.value.trim();
    const username = els.editUsername.value.trim();
    const password = els.editPassword.value; // optional (blank keeps existing)
    const roles = rolesFrom('edit');
    if (!name || !username) return showOverlay('Missing info', 'Name and username are required.', 1800);
    if (!roles.length) return showOverlay('Select roles', 'Tick at least one role.', 1800);
    await API.put('/api/admin/users', { id: selectedUserId, name, username, password, roles });
    await refreshList();
    await openEditor(selectedUserId);
    showOverlay('Saved', 'User updated.', 1400);
  });

  els.resetProgressBtn.addEventListener('click', async () => {
    if (!selectedUserId) return;
    await API.post('/api/admin/reset-progress', { id: selectedUserId });
    await refreshList();
    await openEditor(selectedUserId);
    showOverlay('Reset', 'Progress cleared.', 1500);
  });

  els.backToCreateBtn.addEventListener('click', showCreate);

  await refreshList();
  showCreate();
}



async function itToolsInitInline(){

  const me = await API.get('/api/me');
  if (!me.roles.includes('it')) {
    itTab.innerHTML = `<div class="card"><h2>IT Tools</h2><div class="error">Forbidden</div></div>`;
    return;
  }

  // Simple rich text helpers (execCommand is deprecated but still widely supported in browsers)
  const cmd = (c, v=null) => { try { document.execCommand(c, false, v); } catch(e){} };
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `m_${Math.random().toString(16).slice(2)}_${Date.now()}`);

  itTab.innerHTML = `
    <div class="panel-grid it-word">
      <div class="card">
        <h2>IT Tools</h2>
        <p class="muted">Create multi-page modules with rich text, media, styling, and an end-of-module quiz.</p>

        <div class="form-row">
          <label class="label">Title</label>
          <input id="itModTitle" class="input" placeholder="e.g., Pool Safety">
        </div>

        <div class="form-row">
          <label class="label">Description</label>
          <input id="itModDesc" class="input" placeholder="Shown on the dashboard">
        </div>

        <div class="form-row">
          <div class="muted" style="font-weight:800;margin-bottom:8px">Roles (tick all that apply)</div>
          <div class="role-list">
            <div class="role-item"><div class="left"><input type="checkbox" id="itRoleInstructor"><span>Instructor</span></div></div>
            <div class="role-item"><div class="left"><input type="checkbox" id="itRoleCS"><span>Customer Service</span></div></div>
            <div class="role-item"><div class="left"><input type="checkbox" id="itRoleAdmin"><span>Admin</span></div></div>
            <div class="role-item"><div class="left"><input type="checkbox" id="itRoleIT"><span>IT</span></div></div>
          </div>
        </div>

        <div class="form-row">
          <div class="muted" style="font-weight:800;margin-bottom:8px">Module styling</div>
          <div class="form-row two">
            <div>
              <label class="label">Font</label>
              <select id="itFont" class="input">
                <option value="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif">System</option>
                <option value="Arial, Helvetica, sans-serif">Arial</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="Trebuchet MS, Arial, sans-serif">Trebuchet</option>
                <option value="Verdana, Arial, sans-serif">Verdana</option>
              </select>
            </div>
            <div>
              <label class="label">Base size</label>
              <select id="itFontSize" class="input">
                <option value="14">14px</option>
                <option value="16" selected>16px</option>
                <option value="18">18px</option>
                <option value="20">20px</option>
              </select>
            </div>
          </div>
          <div class="form-row two">
            <div>
              <label class="label">Text colour</label>
              <input id="itTextColor" class="input" type="color" value="#0f172a">
            </div>
            <div>
              <label class="label">Accent colour</label>
              <input id="itAccentColor" class="input" type="color" value="#06b6d4">
            </div>
          </div>
        </div>

        <div class="form-row">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
              <div class="muted" style="font-weight:900">Pages</div>
              <div class="muted">Add multiple pages. Staff will click Next/Back.</div>
            </div>
            <button id="itAddPageBtn" type="button" class="btn ghost">+ Add Page</button>
          </div>
          <div id="itPagesList" class="progress-list" style="margin-top:10px"></div>
        </div>

        <div class="form-row">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div>
              <div class="muted" style="font-weight:900">Quiz (optional)</div>
              <div class="muted">If added, quiz appears after the last page.</div>
            </div>
            <button id="itAddQuestionBtn" type="button" class="btn ghost">+ Add Question</button>
          </div>
          <div id="itQuizList" class="progress-list" style="margin-top:10px"></div>
        </div>

        <div class="form-row two">
          <button id="itCreateBtn" type="button" class="btn primary wide">Create Module</button>
          <button id="itClearBtn" type="button" class="btn ghost wide">Clear</button>
        </div>

        <div id="itOk" class="ok"></div>
        <div id="itErr" class="error"></div>
      </div>

      <div class="card">
        <h2>Existing Custom Modules</h2>
        <p class="muted">These are modules created via IT Tools. (Built-in modules are separate.)</p>
        <div id="itExisting" class="progress-list"></div>
      </div>
    </div>
<style>
  .rt-ribbon{border:1px solid rgba(2,132,199,.18);background:rgba(255,255,255,.92);border-radius:14px;overflow:hidden;margin:10px 0}
  .rt-tabs{display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(2,132,199,.14);background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(240,249,255,.9))}
  .rt-tab{font-size:13px;font-weight:800;color:#0f172a;opacity:.7}
  .rt-tab.active{opacity:1}
  .rt-groups{display:flex;flex-wrap:wrap;gap:14px;padding:10px 12px}
  .rt-group{display:flex;flex-direction:column;gap:6px;min-width:160px}
  .rt-buttons{display:flex;flex-wrap:wrap;gap:8px}
  .rt-btn{border:1px solid rgba(15,23,42,.12);background:#fff;border-radius:10px;padding:8px 10px;font-weight:800;cursor:pointer}
  .rt-btn:hover{background:rgba(3,105,161,.06)}
  .rt-label{font-size:12px;opacity:.75}
  .rt-editor{min-height:220px;border:1px solid rgba(15,23,42,.12);border-radius:14px;padding:14px;background:#fff}
  .rt-page{box-shadow:0 10px 30px rgba(2,132,199,.10)}
  .it-mini{font-size:12px;opacity:0.8}
  .it-row{display:flex;gap:10px;align-items:center;justify-content:space-between}
  .it-row .left{display:flex;gap:10px;align-items:center}
  .it-row .right{display:flex;gap:10px;align-items:center}
  .it-chip{font-size:12px;padding:4px 8px;border-radius:999px;border:1px solid rgba(0,0,0,0.08);background:rgba(255,255,255,0.7)}
  .it-card{padding:12px;border-radius:14px;border:1px solid rgba(2,132,199,0.14);background:rgba(255,255,255,0.75)}
  .it-card h4{margin:0 0 6px 0}
  .it-inline{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .it-inline .input{flex:1;min-width:220px}
  .it-mediaHint{font-size:12px;opacity:0.85;margin-top:6px}
</style>
  `;

  const els = {
    title: document.getElementById('itModTitle'),
    desc: document.getElementById('itModDesc'),
    roleInstructor: document.getElementById('itRoleInstructor'),
    roleCS: document.getElementById('itRoleCS'),
    roleAdmin: document.getElementById('itRoleAdmin'),
    roleIT: document.getElementById('itRoleIT'),
    font: document.getElementById('itFont'),
    fontSize: document.getElementById('itFontSize'),
    textColor: document.getElementById('itTextColor'),
    accentColor: document.getElementById('itAccentColor'),
    addPageBtn: document.getElementById('itAddPageBtn'),
    pagesList: document.getElementById('itPagesList'),
    addQBtn: document.getElementById('itAddQuestionBtn'),
    quizList: document.getElementById('itQuizList'),
    createBtn: document.getElementById('itCreateBtn'),
    clearBtn: document.getElementById('itClearBtn'),
    ok: document.getElementById('itOk'),
    err: document.getElementById('itErr'),
    existing: document.getElementById('itExisting')
  };

  const state = {
    pages: [],
    quiz: []
  };

  const renderPages = () => {
    els.pagesList.innerHTML = state.pages.map((p, idx) => `
      <div class="it-card">
        <div class="it-row">
          <div class="left">
            <span class="it-chip">Page ${idx+1}</span>
            <strong>${escapeHtml(p.title || 'Untitled')}</strong>
            <span class="it-mini">${escapeHtml(p.type)}</span>
          </div>
          <div class="right">
            <button class="btn ghost" data-act="editPage" data-id="${p.id}">Edit</button>
            <button class="btn danger" data-act="delPage" data-id="${p.id}">Delete</button>
          </div>
        </div>
        ${p.type === 'media' ? `<div class="it-mediaHint">Media: ${escapeHtml(p.mediaType || '')} • ${escapeHtml(p.url || '')}</div>` : ``}
      </div>
    `).join('') || `<div class="muted">No pages yet. Click “Add Page”.</div>`;
  };

  const renderQuiz = () => {
    els.quizList.innerHTML = state.quiz.map((q, qi) => `
      <div class="it-card">
        <div class="it-row">
          <div class="left">
            <span class="it-chip">Q${qi+1}</span>
            <strong>${escapeHtml(q.prompt || 'Untitled question')}</strong>
          </div>
          <div class="right">
            <button class="btn ghost" data-act="editQ" data-id="${q.id}">Edit</button>
            <button class="btn danger" data-act="delQ" data-id="${q.id}">Delete</button>
          </div>
        </div>
        <div class="muted">${(q.answers||[]).length} answers • correct: ${(q.correctIndex??0)+1}</div>
      </div>
    `).join('') || `<div class="muted">No quiz questions. (Optional)</div>`;
  };

  const modal = (title, innerHtml, onSave) => {
    const overlay = document.createElement('div');
    overlay.style.position='fixed';
    overlay.style.inset='0';
    overlay.style.background='rgba(0,0,0,0.35)';
    overlay.style.display='flex';
    overlay.style.alignItems='center';
    overlay.style.justifyContent='center';
    overlay.style.padding='20px';
    overlay.style.zIndex='9999';

    const box = document.createElement('div');
    box.className='card';
    box.style.maxWidth='900px';
    box.style.width='100%';
    box.style.maxHeight='85vh';
    box.style.overflow='auto';
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <h2 style="margin:0">${escapeHtml(title)}</h2>
        <button class="btn ghost" id="itModalClose">Close</button>
      </div>
      <div style="margin-top:12px">${innerHtml}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button class="btn ghost" id="itModalCancel">Cancel</button>
        <button class="btn primary" id="itModalSave">Save</button>
      </div>
      <div class="error" id="itModalErr"></div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    box.querySelector('#itModalClose').addEventListener('click', close);
    box.querySelector('#itModalCancel').addEventListener('click', close);
    box.querySelector('#itModalSave').addEventListener('click', async () => {
      const errEl = box.querySelector('#itModalErr');
      errEl.textContent='';
      try {
        await onSave({ box, close, errEl });
      } catch (e) {
        errEl.textContent = e.message || 'Failed';
      }
    });
    return box;
  };

  const addOrEditPage = (existing=null) => {
    const id = existing?.id || uid();
    const type = existing?.type || 'richtext';
    const pageTitle = existing?.title || '';
    const html = existing?.html || '';
    const mediaType = existing?.mediaType || 'image';
    const url = existing?.url || '';
    const caption = existing?.caption || '';

    const box = modal(existing ? 'Edit Page' : 'Add Page', `
      <div class="form-row two">
        <div>
          <label class="label">Page title</label>
          <input id="pTitle" class="input" value="${escapeHtml(pageTitle)}" placeholder="e.g., Safe Supervision">
        </div>
        <div>
          <label class="label">Page type</label>
          <select id="pType" class="input">
            <option value="richtext" ${type==='richtext'?'selected':''}>Rich text</option>
            <option value="media" ${type==='media'?'selected':''}>Media (image/video)</option>
          </select>
        </div>
      </div>

      <div id="pRichWrap" class="form-row" style="${type==='richtext'?'':'display:none'}">
        <div class="muted" style="font-weight:800;margin-bottom:6px">Editor</div>
        <div class="rt-ribbon">
          <div class="rt-tabs">
            <span class="rt-tab active">Home</span>
            <span class="rt-tab">Insert</span>
          </div>
          <div class="rt-groups">
            <div class="rt-group">
              <div class="rt-buttons">
                <button type="button" class="rt-btn" data-cmd="bold" title="Bold"><b>B</b></button>
                <button type="button" class="rt-btn" data-cmd="italic" title="Italic"><i>I</i></button>
                <button type="button" class="rt-btn" data-cmd="underline" title="Underline"><u>U</u></button>
              </div>
              <div class="rt-label">Font style</div>
            </div>
            <div class="rt-group">
              <div class="rt-buttons">
                <button type="button" class="rt-btn" data-cmd="insertUnorderedList" title="Bullets">• List</button>
                <button type="button" class="rt-btn" data-cmd="insertOrderedList" title="Numbered">1. List</button>
              </div>
              <div class="rt-label">Paragraph</div>
            </div>
            <div class="rt-group">
              <div class="rt-buttons">
                <button type="button" class="rt-btn" data-cmd="formatBlock" data-val="p" title="Normal">Normal</button>
                <button type="button" class="rt-btn" data-cmd="formatBlock" data-val="h2" title="Heading 2">H2</button>
                <button type="button" class="rt-btn" data-cmd="formatBlock" data-val="h3" title="Heading 3">H3</button>
              </div>
              <div class="rt-label">Styles</div>
            </div>
            <div class="rt-group">
              <div class="rt-buttons">
                <button type="button" class="rt-btn" data-cmd="createLink" title="Insert link">Link</button>
                <button type="button" class="rt-btn" data-cmd="insertImage" title="Insert image by URL">Image</button>
                <button type="button" class="rt-btn" data-cmd="removeFormat" title="Clear formatting">Clear</button>
              </div>
              <div class="rt-label">Insert</div>
            </div>
          </div>
        </div>
        <div id="pEditor" class="rt-editor" contenteditable="true"></div>
        <div class="it-mini">Tip: You can paste text, add headings, lists, and images via URL.</div>
      </div>

      <div id="pMediaWrap" class="form-row" style="${type==='media'?'':'display:none'}">
        <div class="form-row two">
          <div>
            <label class="label">Media type</label>
            <select id="pMediaType" class="input">
              <option value="image" ${mediaType==='image'?'selected':''}>Image (URL)</option>
              <option value="video" ${mediaType==='video'?'selected':''}>Video (YouTube/Vimeo/embed URL)</option>
            </select>
          </div>
          <div>
            <label class="label">URL</label>
            <input id="pUrl" class="input" value="${escapeHtml(url)}" placeholder="https://...">
          </div>
        </div>
        <div class="form-row">
          <label class="label">Caption (optional)</label>
          <input id="pCaption" class="input" value="${escapeHtml(caption)}" placeholder="Shown under the media">
        </div>
        <div class="it-mini">Images and videos must be hosted somewhere accessible via URL.</div>
      </div>
    `, async ({ box, close, errEl }) => {
      const t = box.querySelector('#pTitle').value.trim();
      const ty = box.querySelector('#pType').value;
      if (!t) throw new Error('Page title is required.');
      let page = { id, type: ty, title: t };

      if (ty === 'richtext') {
        const ed = box.querySelector('#pEditor');
        const htmlOut = (ed.innerHTML || '').trim();
        if (!htmlOut) throw new Error('Page content is required.');
        page.html = htmlOut;
      } else {
        const mt = box.querySelector('#pMediaType').value;
        const u = box.querySelector('#pUrl').value.trim();
        if (!u) throw new Error('Media URL is required.');
        page.mediaType = mt;
        page.url = u;
        page.caption = box.querySelector('#pCaption').value.trim();
      }

      const i = state.pages.findIndex(x => x.id === id);
      if (i >= 0) state.pages[i] = page;
      else state.pages.push(page);
      renderPages();
      close();
    });

    // Wire editor
    const pTypeSel = box.querySelector('#pType');
    const richWrap = box.querySelector('#pRichWrap');
    const mediaWrap = box.querySelector('#pMediaWrap');
    const editor = box.querySelector('#pEditor');
    if (editor) editor.innerHTML = html || '';

    pTypeSel.addEventListener('change', () => {
      const v = pTypeSel.value;
      richWrap.style.display = v === 'richtext' ? '' : 'none';
      mediaWrap.style.display = v === 'media' ? '' : 'none';
    });

    box.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const c = btn.getAttribute('data-cmd');
        const val = btn.getAttribute('data-val');
        if (c === 'createLink') {
          const url = prompt('Link URL:');
          if (url) cmd('createLink', url);
          return;
        }
        if (c === 'insertImage') {
          const url = prompt('Image URL:');
          if (url) cmd('insertImage', url);
          return;
        }
        if (c === 'formatBlock') {
          cmd('formatBlock', val);
          return;
        }
        cmd(c);
      });
    });
  };

  const addOrEditQuestion = (existing=null) => {
    const id = existing?.id || uid();
    const promptTxt = existing?.prompt || '';
    const answers = existing?.answers || ['', '', '', ''];
    const correctIndex = existing?.correctIndex ?? 0;

    const box = modal(existing ? 'Edit Question' : 'Add Question', `
      <div class="form-row">
        <label class="label">Question</label>
        <input id="qPrompt" class="input" value="${escapeHtml(promptTxt)}" placeholder="e.g., How often do we test pool water?">
      </div>
      <div class="form-row">
        <div class="muted" style="font-weight:800;margin-bottom:6px">Answers (pick the correct one)</div>
        <div class="progress-list" style="margin-top:0">
          ${answers.map((a, i) => `
            <div class="it-card">
              <div class="it-inline">
                <input type="radio" name="qCorrect" value="${i}" ${i===correctIndex?'checked':''}>
                <input id="qA${i}" class="input" value="${escapeHtml(a)}" placeholder="Answer ${i+1}">
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `, async ({ box, close }) => {
      const p = box.querySelector('#qPrompt').value.trim();
      if (!p) throw new Error('Question text is required.');
      const ans = [0,1,2,3].map(i => box.querySelector(`#qA${i}`).value.trim());
      if (ans.some(a => !a)) throw new Error('All 4 answers are required.');
      const ci = Number(box.querySelector('input[name="qCorrect"]:checked')?.value ?? 0);
      const q = { id, prompt: p, answers: ans, correctIndex: ci };

      const i = state.quiz.findIndex(x => x.id === id);
      if (i >= 0) state.quiz[i] = q;
      else state.quiz.push(q);
      renderQuiz();
      close();
    });
  };

  els.addPageBtn.addEventListener('click', (e) => { e.preventDefault(); try { addOrEditPage(); } catch(err){ els.err.textContent = err?.message || String(err); } });
  els.pagesList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    const page = state.pages.find(p => p.id === id);
    if (!page) return;
    if (act === 'editPage') return addOrEditPage(page);
    if (act === 'delPage') {
      if (!confirm('Delete this page?')) return;
      state.pages = state.pages.filter(p => p.id !== id);
      renderPages();
    }
  });

  els.addQBtn.addEventListener('click', (e) => { e.preventDefault(); try { addOrEditQuestion(); } catch(err){ els.err.textContent = err?.message || String(err); } });
  els.quizList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    const q = state.quiz.find(x => x.id === id);
    if (!q) return;
    if (act === 'editQ') return addOrEditQuestion(q);
    if (act === 'delQ') {
      if (!confirm('Delete this question?')) return;
      state.quiz = state.quiz.filter(x => x.id !== id);
      renderQuiz();
    }
  });

  const clearAll = () => {
    els.title.value = '';
    els.desc.value = '';
    els.roleInstructor.checked = false;
    els.roleCS.checked = false;
    els.roleAdmin.checked = false;
    els.roleIT.checked = false;
    els.font.value = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    els.fontSize.value = "16";
    els.textColor.value = "#0f172a";
    els.accentColor.value = "#06b6d4";
    state.pages = [];
    state.quiz = [];
    renderPages();
    renderQuiz();
  };

  els.clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the builder?')) return;
    clearAll();
    els.ok.textContent = '';
    els.err.textContent = '';
  });

  const refreshExisting = async () => {
    try {
      const out = await API.get('/api/it/modules');
      els.existing.innerHTML = (out.modules || []).map(m => `
        <div class="progress-item">
          <div>
            <div style="font-weight:900">${escapeHtml(m.title)}</div>
            <div class="muted">${escapeHtml(m.desc || '')}</div>
            <div class="muted">Roles: ${(m.roles||[]).map(roleLabel).join(', ')}</div>
          </div>
          <div class="pill pending">CUSTOM</div>
        </div>
      `).join('') || `<div class="muted">No custom modules yet.</div>`;
    } catch (e) {
      els.existing.innerHTML = `<div class="error">${escapeHtml(e.message||'Failed to load')}</div>`;
    }
  };

  els.createBtn.addEventListener('click', async () => {
    els.ok.textContent='';
    els.err.textContent='';
    els.createBtn.disabled = true;
    try {
      const title = els.title.value.trim();
      if (!title) throw new Error('Title is required.');
      if (state.pages.length === 0) throw new Error('Add at least one page.');

      const roles = [];
      if (els.roleInstructor.checked) roles.push('instructor');
      if (els.roleCS.checked) roles.push('cs');
      if (els.roleAdmin.checked) roles.push('admin');
      if (els.roleIT.checked) roles.push('it');
      if (roles.length === 0) throw new Error('Select at least one role.');

      const style = {
        fontFamily: els.font.value,
        baseFontPx: Number(els.fontSize.value || 16),
        textColor: els.textColor.value,
        accentColor: els.accentColor.value
      };

      // Convert quiz to API format (answers with ids + correct answer id)
      let quiz = null;
      if (state.quiz.length > 0) {
        quiz = {
          title: `${title} Quiz`,
          questions: state.quiz.map((q) => ({
            prompt: q.prompt,
            answers: q.answers.map((t, i) => ({ id: `a${i+1}`, text: t })),
            correctAnswerId: `a${q.correctIndex+1}`
          }))
        };
      }

      await API.post('/api/it/modules', {
        title,
        desc: els.desc.value.trim(),
        roles,
        style,
        pages: state.pages,
        quiz
      });

      els.ok.textContent = 'Module created.';
      clearAll();
      await refreshExisting();
    } catch (e) {
      els.err.textContent = e.message || 'Failed';
    } finally {
      els.createBtn.disabled = false;
    }
  });

  renderPages();
  renderQuiz();
  await refreshExisting();
}

function slugify(s){
  return (s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,50);
}

async function itPageInit() {
  const me = await guard(); if (!me) return;
  if (!me.roles.includes('it')) { location.href = 'dashboard.html'; return; }
  await topbarInit(me);
  const host = document.getElementById('pageHost');
  host.innerHTML = `
    <div class="topbar" style="margin-bottom:14px">
      <div class="brand">
        <div class="logo"></div>
        <div>
          <h2 style="margin:0;color:var(--primary)">IT Tools</h2>
          <div class="sub">Create modules & assign to roles</div>
        </div>
      </div>
      <div class="pill">
        <span id="currentUserInfo" style="font-weight:900"></span>
        <button class="secondary" id="logoutBtn">Logout</button>
      </div>
    </div>
    <div class="tabs" style="margin-bottom:14px">
      <button class="tab-btn" onclick="location.href='dashboard.html'">Back to Dashboard</button>
    </div>
    <div id="itMount"></div>
  `;
  await itToolsWire(document.getElementById('itMount'));
}

async function itToolsWire(mount){
  mount.innerHTML = `
    <div class="grid">
      <div class="card">
        <h3 style="margin:0">Create Module</h3>
        <p style="margin-top:6px" class="sub">Modules you create will appear for assigned roles on the Training tab.</p>

        <div class="row">
          <div><input id="itTitle" placeholder="Module title" /></div>
          <div><input id="itId" placeholder="Optional id (leave blank to auto-generate)" /></div>
        </div>

        <div style="margin:10px 0 6px">
          <label style="font-size:12px;color:var(--muted);font-weight:900">Assign to roles</label>
        </div>

        <div class="role-list">
          <div class="role-item"><div class="left"><input type="checkbox" id="itRoleAdmin"><span>Admin</span></div></div>
          <div class="role-item"><div class="left"><input type="checkbox" id="itRoleInstructor" checked><span>Instructor</span></div></div>
          <div class="role-item"><div class="left"><input type="checkbox" id="itRoleCS"><span>Customer Service</span></div></div>
          <div class="role-item"><div class="left"><input type="checkbox" id="itRoleIT" checked><span>IT</span></div></div>
        </div>

        <div style="margin-top:12px">
          <textarea id="itContent" placeholder="Module content (plain text)" style="width:100%;min-height:180px;padding:12px 14px;border-radius:12px;border:1px solid rgba(0,180,216,0.18);background:rgba(255,255,255,0.85)"></textarea>
        </div>

        <button id="itCreateBtn" style="width:100%;margin-top:12px">Create Module</button>
        <div id="itCreateMsg" class="sub" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <h3 style="margin:0">Modules</h3>
        <p class="sub" style="margin-top:6px">Built-in modules + your custom modules.</p>
        <div id="itModuleList" style="margin-top:12px"></div>
      </div>
    </div>
  `;

  async function refresh(){
    const mods = await API.get('/api/it/modules');
    const list = mods.map(m => {
      const roles = (m.roles||[]).join(', ');
      const kind = m.custom ? 'CUSTOM' : 'BUILT-IN';
      return `
        <div class="item">
          <div>
            <strong>${escapeHtml(m.title)}</strong>
            <p style="margin:4px 0 0">${escapeHtml(kind)} • id: ${escapeHtml(m.id)} • roles: ${escapeHtml(roles)}</p>
          </div>
          <span class="badge ${m.custom ? 'pending' : 'done'}">${m.custom ? 'CUSTOM' : 'CORE'}</span>
        </div>
      `;
    }).join('');
    document.getElementById('itModuleList').innerHTML = list || '<div class="sub">No modules.</div>';
  }

  await refresh();

  document.getElementById('itCreateBtn').addEventListener('click', async () => {
    const title = document.getElementById('itTitle').value.trim();
    const idRaw = document.getElementById('itId').value.trim();
    const content = document.getElementById('itContent').value.trim();
    const roles = [];
    if (document.getElementById('itRoleAdmin').checked) roles.push('admin');
    if (document.getElementById('itRoleInstructor').checked) roles.push('instructor');
    if (document.getElementById('itRoleCS').checked) roles.push('cs');
    if (document.getElementById('itRoleIT').checked) roles.push('it');

    const msg = document.getElementById('itCreateMsg');
    msg.textContent = '';

    if (!title) return msg.textContent = 'Title is required.';
    if (!content) return msg.textContent = 'Content is required.';
    if (!roles.length) return msg.textContent = 'Select at least one role.';

    const id = idRaw || slugify(title);

    try{
      await API.post('/api/it/modules', { title, id, content, roles });
      msg.textContent = 'Created.';
      document.getElementById('itTitle').value='';
      document.getElementById('itId').value='';
      document.getElementById('itContent').value='';
      await refresh();
    }catch(e){
      msg.textContent = (e && e.message) ? e.message : 'Failed.';
    }
  });
}
