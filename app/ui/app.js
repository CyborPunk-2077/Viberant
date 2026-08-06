/**
 * The page.
 *
 * It holds no truth. Everything on screen came from the server a moment ago and
 * everything you press goes straight back to it. That is deliberate: if this
 * file kept its own idea of how things stand, it would eventually show you
 * something that is not true, and being believable is the whole product.
 *
 * The two exceptions are choices you have made but not yet acted on — which
 * account an app should open with, which folder it should open in. Those live
 * here until you press the button, because until then they have not happened.
 */

const $ = (s) => document.querySelector(s);
const view = $('#view');
const layer = $('#layer');

const api = async (path, body) => {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  return res.json();
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ago = (at) => {
  if (!at) return '';
  const secs = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  return `${Math.floor(secs / 86400)} days ago`;
};

const size = (bytes) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB`
  : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.round(bytes / 1e3)} KB`);

const tail = (path) => String(path ?? '').split(/[\\/]/).filter(Boolean).pop() ?? '';

// ---------------------------------------------------------------------------
// The one place a sentence is shown
// ---------------------------------------------------------------------------

let said = null;
const say = (r) => { said = r && r.sentence ? r : null; return r; };

function saidHtml() {
  if (!said) return '';
  const tone = said.ok === false ? 'bad' : said.ok === true ? 'good' : '';
  return `<div class="said ${tone}"><b>${esc(said.sentence)}</b>${
    said.action ? `<span>${esc(said.action)}</span>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Where we are
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'projects', name: 'Projects', glyph: '◳' },
  { id: 'apps', name: 'AI apps', glyph: '✦' },
  { id: 'terminals', name: 'Terminals', glyph: '❯' },
  { id: 'workspace', name: 'Shared workspace', glyph: '⌸' },
  { id: 'ship', name: 'Put it out', glyph: '↗' },
  { id: 'settings', name: 'Settings', glyph: '⚙' },
];

const at = { tab: 'projects', inside: false };
let me = { machine: null, machineName: '', github: null, workspace: {}, settings: {}, current: null };

/** Choices made but not yet acted on. */
const chosen = { account: {}, folder: {} };

async function refreshMe() {
  me = await api('/me');
  document.documentElement.dataset.theme = me.settings?.appearance === 'system'
    ? '' : (me.settings?.appearance ?? '');
  drawNav();
}

function drawNav() {
  $('#nav').innerHTML = `
    <div class="brand"><span class="bead"></span><span>Viberant</span></div>
    ${TABS.map((t, i) => `
      <button class="tab ${at.tab === t.id ? 'on' : ''}" data-tab="${t.id}">
        <span aria-hidden="true">${t.glyph}</span>
        <span class="label">${esc(t.name)}</span>
        <span class="key">${i + 1}</span>
      </button>`).join('')}
    <div class="sep"></div>
    <div class="foot" style="border:0;padding:.5rem .2rem">
      <div class="drop">
        <button class="who" id="who">
          <span class="dot ${me.github ? 'live' : 'off'}"></span>
          <span class="grow">
            <span class="name">${esc(me.github ?? 'Not signed in')}</span>
            <span class="what">${me.github ? 'GitHub' : 'sign in to GitHub'}</span>
          </span>
          <span style="color:var(--faint)">▾</span>
        </button>
        <div class="panel" hidden id="who-panel"></div>
      </div>
      <div style="padding:.5rem .35rem 0;color:var(--faint);font-size:.74rem">
        ${esc(me.machineName || 'This computer')}${me.currentName ? ` · ${esc(me.currentName)}` : ''}
      </div>
    </div>`;

  for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => go(b.dataset.tab);
  $('#who').onclick = (e) => { e.stopPropagation(); openWhoPanel(); };
}

async function openWhoPanel() {
  const panel = $('#who-panel');
  if (!panel.hidden) { panel.hidden = true; return; }
  closePanels();
  panel.hidden = false;
  panel.innerHTML = '<div class="head">GitHub</div><div class="pick"><span class="spin"></span> looking…</div>';

  const g = await api('/github');
  panel.innerHTML = `
    <div class="head">Signed in on this computer</div>
    ${g.accounts.length ? g.accounts.map((a) => `
      <button class="pick ${a.active ? 'on' : ''}" data-gh-use="${esc(a.name)}">
        <span class="dot ${a.active ? 'live' : 'off'}"></span>
        <span class="grow"><b>${esc(a.name)}</b><br>
          <span class="sub">${a.active ? 'in use right now' : 'switch to this one'}</span></span>
      </button>`).join('')
    : '<div class="pick"><span class="sub">No account yet.</span></div>'}
    <hr>
    <button class="pick" id="gh-add"><span>＋</span><span class="grow">Sign in to another account</span></button>
    <button class="pick" id="gh-name"><span>✎</span><span class="grow">Your name on saved work</span></button>
    ${g.active ? `<button class="pick" id="gh-out"><span>↷</span><span class="grow">Sign ${esc(g.active)} out</span></button>` : ''}`;

  for (const b of panel.querySelectorAll('[data-gh-use]')) {
    b.onclick = async () => {
      closePanels();
      say(await api('/github/switch', { name: b.dataset.ghUse }));
      await refreshMe();
      draw();
    };
  }
  $('#gh-add').onclick = async () => { closePanels(); say(await api('/github/signin')); draw(); };
  $('#gh-name').onclick = async () => { closePanels(); identitySheet(g); };
  $('#gh-out')?.addEventListener('click', async () => {
    closePanels();
    const sure = await confirmThat({
      title: 'Sign out',
      what: `${g.active} will be signed out on this computer.`,
      why: 'Nothing on GitHub itself changes. You can sign back in whenever you like.',
      confirm: 'Sign out',
      danger: true,
    });
    if (!sure) return;
    say(await api('/github/signout', { name: g.active }));
    await refreshMe();
    draw();
  });
}

function identitySheet(g) {
  sheet({
    title: 'Your name on saved work',
    narrow: true,
    body: `
      <p class="sub">Everything you save is signed with this. It is not shown to anyone
        except people who look at the project itself.</p>
      <label class="field">Name</label>
      <input id="id-name" style="width:100%;margin-bottom:.7rem" value="${esc(g.identity.name ?? '')}" placeholder="Your name">
      <label class="field">Email</label>
      <input id="id-mail" style="width:100%" value="${esc(g.identity.email ?? '')}" placeholder="you@example.com">`,
    foot: '<button class="quiet" id="id-no">Never mind</button><button class="go" id="id-yes">Save</button>',
    onOpen: () => {
      $('#id-no').onclick = closeLayer;
      $('#id-yes').onclick = async () => {
        closeLayer();
        say(await api('/github/identity', { name: $('#id-name').value, email: $('#id-mail').value }));
        draw();
      };
    },
  });
}

const SCREENS = {};

async function go(tab, { keepSaid = false } = {}) {
  at.tab = tab;
  if (!keepSaid) said = null;
  closePanels();
  drawNav();
  await draw();
}

async function draw() {
  await SCREENS[at.tab]?.();
}

function closePanels() {
  for (const p of document.querySelectorAll('.panel')) p.hidden = true;
}

addEventListener('click', (e) => { if (!e.target.closest('.drop')) closePanels(); });

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function closeLayer() { layer.innerHTML = ''; }

function sheet({ title, body, foot = '', narrow = false, onOpen }) {
  layer.innerHTML = `
    <div class="veil">
      <div class="sheet ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">
        <header><b>${esc(title)}</b><button class="quiet x" id="sheet-x">close</button></header>
        <div class="body" id="sheet-body">${body}</div>
        ${foot ? `<footer>${foot}</footer>` : ''}
      </div>
    </div>`;
  $('#sheet-x').onclick = closeLayer;
  layer.querySelector('.veil').onclick = (e) => { if (e.target === e.currentTarget) closeLayer(); };
  onOpen?.($('#sheet-body'));
}

/**
 * Ask for one line of text.
 *
 * The browser's own box for this does not exist inside the app's own window, so
 * asking for it would silently do nothing. This is that, in the app.
 */
function ask({ title, label, value = '', placeholder = '', confirm = 'Done' }) {
  return new Promise((resolve) => {
    sheet({
      title,
      narrow: true,
      body: `<label class="field">${esc(label)}</label>
             <input id="ask-input" style="width:100%" value="${esc(value)}" placeholder="${esc(placeholder)}">`,
      foot: `<button class="quiet" id="ask-no">Never mind</button>
             <button class="go" id="ask-yes">${esc(confirm)}</button>`,
      onOpen: () => {
        const input = $('#ask-input');
        input.focus();
        input.select();
        const done = (v) => { closeLayer(); resolve(v); };
        $('#ask-yes').onclick = () => done(input.value.trim() || null);
        $('#ask-no').onclick = () => done(null);
        input.onkeydown = (e) => {
          if (e.key === 'Enter') done(input.value.trim() || null);
          if (e.key === 'Escape') done(null);
        };
      },
    });
  });
}

function confirmThat({ title, what, why, confirm = 'Yes, do it', danger = false }) {
  return new Promise((resolve) => {
    sheet({
      title,
      narrow: true,
      body: `<p style="margin:0 0 .6rem">${esc(what)}</p>
             ${why ? `<p style="margin:0;color:var(--quiet);font-size:.89rem">${esc(why)}</p>` : ''}`,
      foot: `<button class="quiet" id="c-no">Never mind</button>
             <button class="${danger ? 'danger' : 'go'}" id="c-yes">${esc(confirm)}</button>`,
      onOpen: () => {
        $('#c-yes').onclick = () => { closeLayer(); resolve(true); };
        $('#c-no').onclick = () => { closeLayer(); resolve(false); };
      },
    });
  });
}

/** Pick a folder by clicking down to it, or by using the one Windows has. */
function pickFolder({ title = 'Choose a folder', confirm = 'Use this folder', startAt = null } = {}) {
  return new Promise((resolve) => {
    let herePath = null;

    const paint = async (path) => {
      const box = $('#walk-box');
      box.innerHTML = '<div class="item"><span class="spin"></span> looking…</div>';
      const r = await api(`/browse?at=${encodeURIComponent(path ?? '')}`);
      if (!r.ok) { box.innerHTML = `<div class="item">${esc(r.sentence)}</div>`; return; }

      herePath = r.at;
      $('#walk-here').textContent = r.at;
      $('#walk-up').disabled = !r.up;
      $('#walk-take').textContent = r.project ? `${confirm} ✓ a project` : confirm;
      box.innerHTML = r.folders.length
        ? r.folders.map((f) => `
            <div class="item" data-into="${esc(f.path)}">
              <span class="leaf">${f.project ? '◆' : '▸'}</span>
              <span class="grow">${esc(f.name)}</span>
              ${f.project ? '<span class="chip">a project</span>' : ''}
            </div>`).join('')
        : '<div class="item"><span class="leaf">·</span> nothing inside this one</div>';

      for (const item of box.querySelectorAll('[data-into]')) item.onclick = () => paint(item.dataset.into);
      $('#walk-up').onclick = () => paint(r.up);
    };

    sheet({
      title,
      body: `
        <div class="bar" id="walk-starts"></div>
        <div class="walk">
          <div class="here"><button class="quiet small" id="walk-up">↑ up</button><span id="walk-here"></span></div>
          <div class="list" id="walk-box"></div>
        </div>`,
      foot: `<button class="quiet" id="walk-native">Use the Windows folder chooser</button>
             <button class="quiet" id="walk-no">Never mind</button>
             <button class="go" id="walk-take">${esc(confirm)}</button>`,
      onOpen: async () => {
        $('#walk-no').onclick = () => { closeLayer(); resolve(null); };
        $('#walk-take').onclick = () => { closeLayer(); resolve(herePath); };
        $('#walk-native').onclick = async () => {
          const button = $('#walk-native');
          button.disabled = true;
          button.textContent = 'Waiting for the chooser…';
          const r = await api('/browse/choose', { startAt: herePath });
          button.disabled = false;
          button.textContent = 'Use the Windows folder chooser';
          if (r.ok) { closeLayer(); resolve(r.path); return; }
          if (r.cancelled) return;
          say(r);
          closeLayer();
          resolve(null);
          draw();
        };

        const { places } = await api('/browse/starts');
        $('#walk-starts').innerHTML = places
          .map((p) => `<button class="small" data-start="${esc(p.path)}">${esc(p.name)}</button>`).join('');
        for (const b of document.querySelectorAll('[data-start]')) b.onclick = () => paint(b.dataset.start);
        await paint(startAt ?? places[0]?.path ?? null);
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

const MARK_LOOK = {
  working: { chip: 'live', name: 'Working on it' },
  waiting: { chip: 'attention', name: 'Waiting' },
  finished: { chip: '', name: 'Finished' },
};

SCREENS.projects = async () => {
  if (at.inside) return drawOpenProject();

  const d = await api('/projects');
  const busy = d.projects.filter((p) => p.unsaved).length;

  view.innerHTML = `
    <h1>Your projects</h1>
    <p class="sub">Pick one, and every app on this computer opens already inside it.
      ${d.projects.length
    ? `${d.projects.length} here${busy ? `, ${busy} with work you have not saved` : ', all saved'}.`
    : ''}</p>

    <div class="bar">
      <button class="go" id="p-add">Choose a folder…</button>
      ${me.github ? '<button id="p-cloud">Bring one down from GitHub…</button>' : ''}
    </div>
    ${saidHtml()}

    ${d.projects.length
    ? `<div class="stack">${d.projects.map(projectSlab).join('')}</div>`
    : `<div class="empty"><b>Nothing here yet.</b>
         Choose a folder above and it becomes the project every app opens into.</div>`}`;
  said = null;

  $('#p-add').onclick = async () => {
    const path = await pickFolder({ title: 'Which folder is the project?', confirm: 'Open this folder' });
    if (path) await openProject(path);
  };
  $('#p-cloud')?.addEventListener('click', fromGitHub);

  for (const el of document.querySelectorAll('[data-open]')) {
    el.onclick = (e) => { if (e.target.closest('button')) return; openProject(el.dataset.open); };
  }
  for (const b of document.querySelectorAll('[data-open-now]')) b.onclick = () => openProject(b.dataset.openNow);
  for (const b of document.querySelectorAll('[data-mark]')) b.onclick = () => markSheet(b.dataset.mark, d.marks);
  for (const b of document.querySelectorAll('[data-look]')) b.onclick = () => statusSheet(b.dataset.look);
  for (const b of document.querySelectorAll('[data-private]')) {
    b.onclick = async () => {
      say(await api('/projects/private', { path: b.dataset.private, private: b.dataset.now !== '1' }));
      draw();
    };
  }
};

/**
 * One project, with the four things worth knowing at a glance: what state it is
 * in, when you last stopped, what you were doing when you did, and where it is.
 */
function projectSlab(p) {
  const look = MARK_LOOK[p.mark];
  return `
    <div class="slab" data-open="${esc(p.path)}">
      <span class="dot ${p.unsaved ? 'attention' : 'live'}"></span>
      <div class="grow">
        <div class="line1">
          <b>${esc(p.name)}</b>
          ${p.kind ? `<span class="chip">${esc(p.kind)}</span>` : ''}
          ${look ? `<span class="chip ${look.chip}">${esc(look.name)}</span>` : ''}
          ${p.private ? '<span class="chip">private to this computer</span>' : ''}
          ${p.shared ? '' : '<span class="chip">not on GitHub</span>'}
          ${p.toSend ? `<span class="chip attention">${p.toSend} saved change${p.toSend === 1 ? '' : 's'} to send</span>` : ''}
        </div>
        <div class="fact"><em>${esc(p.says)}</em> · ${esc(p.saved)}</div>
        ${p.lastDid ? `<div class="did">Last time: ${esc(p.lastDid)}</div>` : ''}
        <div class="path">${esc(p.path)}</div>
      </div>
      <div class="acts">
        <button class="go small" data-open-now="${esc(p.path)}">Open</button>
        <button class="small" data-look="${esc(p.path)}">What is in it</button>
        <button class="small" data-mark="${esc(p.path)}">${look ? 'Change mark' : 'Mark it'}</button>
        <button class="quiet small" data-private="${esc(p.path)}" data-now="${p.private ? '1' : '0'}">
          ${p.private ? 'let my computers see it' : 'keep it private'}</button>
      </div>
    </div>`;
}

async function openProject(path) {
  const r = await api('/open', { path });
  if (r.ok === false) { say(r); return draw(); }
  at.inside = true;
  said = null;
  await refreshMe();
  await draw();
}

function markSheet(path, marks) {
  sheet({
    title: 'Where have you got to?',
    narrow: true,
    body: `<div class="menu">
      ${marks.map((m) => `
        <button class="opt" data-set="${esc(m.id)}">
          <span class="glyph">${m.id === 'working' ? '◈' : m.id === 'waiting' ? '◔' : '✓'}</span>
          <span><span class="what">${esc(m.name)}</span><br><span class="why">${esc(m.blurb)}</span></span>
        </button>`).join('')}
      <button class="opt" data-set=""><span class="glyph">·</span>
        <span><span class="what">No mark</span><br><span class="why">Take the label off again.</span></span></button>
    </div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-set]')) {
        b.onclick = async () => {
          closeLayer();
          say(await api('/projects/mark', { path, mark: b.dataset.set || null }));
          draw();
        };
      }
    },
  });
}

async function statusSheet(path) {
  const opened = await api('/open', { path });
  if (opened.ok === false) { say(opened); return draw(); }
  const [changes, history] = await Promise.all([api('/github/changes'), api('/github/history')]);

  sheet({
    title: opened.name,
    body: `
      <p style="margin:0 0 1rem"><b>${esc(opened.says)}</b><br>
      <span style="color:var(--quiet)">${esc(opened.saved)}</span></p>

      <h2 style="margin-top:0">Changed since you last saved</h2>
      ${changes.changes.length
        ? `<div class="log">${changes.changes.map((c) => `${esc(c.name)} — ${esc(c.says)}`).join('\n')}</div>`
        : '<p style="color:var(--quiet);margin:0">Nothing. Everything here is saved.</p>'}

      <h2>Recently saved</h2>
      ${history.saves.length
        ? history.saves.slice(0, 8).map((s) => `
            <div class="row" style="margin-bottom:.35rem">
              <span class="dot off"></span>
              <div class="grow"><div class="name" style="font-weight:450">${esc(s.what)}</div>
              <div class="note">${esc(s.when)} · ${esc(s.by)}</div></div>
            </div>`).join('')
        : '<p style="color:var(--quiet);margin:0">Nothing saved here yet.</p>'}`,
    foot: `<button class="quiet" id="s-forget">Take it off the list</button>
           <button class="go" id="s-open">Open this project</button>`,
    onOpen: () => {
      $('#s-open').onclick = async () => { closeLayer(); at.inside = true; await refreshMe(); draw(); };
      $('#s-forget').onclick = async () => {
        closeLayer();
        const sure = await confirmThat({
          title: 'Take it off the list?',
          what: `${opened.name} would stop being listed here.`,
          why: 'The folder itself is not touched. Nothing in it is deleted.',
          confirm: 'Take it off',
          danger: true,
        });
        if (!sure) return;
        say(await api('/projects/forget', { path }));
        at.inside = false;
        await refreshMe();
        draw();
      };
    },
  });
}

async function fromGitHub() {
  sheet({
    title: 'Your projects on GitHub',
    body: '<div class="row"><span class="spin"></span><div class="grow">Asking GitHub what you have…</div></div>',
    onOpen: async (body) => {
      const r = await api('/github/mine');
      if (!r.ok) {
        body.innerHTML = `<p><b>${esc(r.sentence)}</b><br><span style="color:var(--quiet)">${esc(r.action ?? '')}</span></p>`;
        return;
      }
      body.innerHTML = `
        <p class="sub" style="margin-bottom:1rem">Pick one and it comes down to this computer, ready to open.</p>
        ${r.projects.map((p) => `
          <div class="row pick" data-url="${esc(p.url)}" data-name="${esc(p.name)}">
            <span class="dot ${p.visibility === 'public' ? 'live' : 'off'}"></span>
            <div class="grow"><div class="name">${esc(p.name)}</div>
              <div class="note">${esc(p.about ?? 'No description')} · changed ${ago(p.changed)}</div></div>
            <span class="chip">${esc(p.visibility)}</span>
          </div>`).join('')}`;
      for (const row of body.querySelectorAll('[data-url]')) {
        row.onclick = async () => {
          closeLayer();
          const into = await pickFolder({ title: `Where should ${row.dataset.name} go?`, confirm: 'Put it in here' });
          if (!into) return;
          say({ sentence: `Bringing ${row.dataset.name} down…` });
          draw();
          say(await api('/github/bring', { url: row.dataset.url, into }));
          await refreshMe();
          draw();
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// One project, open
// ---------------------------------------------------------------------------

async function drawOpenProject() {
  const p = await api('/project');
  if (!p.open) { at.inside = false; return draw(); }

  const efforts = p.home.ranks.flatMap((r) => r.efforts.map((e) => ({ ...e, rank: r.name })));
  const look = MARK_LOOK[p.mark];

  view.innerHTML = `
    <button class="quiet" id="back" style="margin:0 0 1rem;padding-left:0">← all projects</button>
    <h1>${esc(p.name)}
      ${look ? `<span class="chip ${look.chip}" style="vertical-align:middle;margin-left:.5rem">${esc(look.name)}</span>` : ''}
    </h1>
    <p class="sub">${esc(p.says)} · ${esc(p.saved)}<br><span style="color:var(--faint)">${esc(p.dir)}</span></p>

    <div class="card" style="margin-bottom:1.4rem">
      <label class="field">What did you do?</label>
      <div class="bar" style="margin:0">
        <input id="msg" placeholder="Made the sign-in page work" style="flex:1">
        <button class="go" id="pub">Save and send to GitHub</button>
        <button id="more">More…</button>
      </div>
    </div>
    ${saidHtml()}

    <h2>Open this project in</h2>
    <div class="bar">
      <button id="to-apps">Choose an AI app →</button>
      <button id="to-terms">Open a terminal here →</button>
      <button id="to-ship">Put it out into the world →</button>
    </div>

    ${efforts.length ? `
      <h2>What you have open here
        <button class="quiet small" id="tidy" style="float:right;text-transform:none;letter-spacing:0">clear the list</button>
      </h2>
      ${efforts.map((e) => `
        <div class="row">
          <span class="dot ${e.rank === 'moving' ? 'live' : e.rank === 'waiting on you' ? 'attention' : 'off'}"></span>
          <div class="grow"><div class="name">${esc(e.intent)}</div>
            <div class="note">${esc(e.rank === 'moving' ? 'open' : e.rank)} · last opened ${esc(e.ago)}</div></div>
          <button class="quiet small" data-done="${esc(e.id)}">finished</button>
          <button class="quiet small" data-drop="${esc(e.id)}">remove</button>
        </div>`).join('')}` : ''}`;
  said = null;

  $('#back').onclick = async () => { at.inside = false; await api('/close'); await refreshMe(); draw(); };
  $('#pub').onclick = saveAndSend;
  $('#msg').onkeydown = (e) => { if (e.key === 'Enter') saveAndSend(); };
  $('#more').onclick = () => gitHubSheet(p);
  $('#to-apps').onclick = () => go('apps');
  $('#to-terms').onclick = () => go('terminals');
  $('#to-ship').onclick = () => go('ship');
  $('#tidy')?.addEventListener('click', async () => {
    const sure = await confirmThat({
      title: 'Clear the list',
      what: 'Everything on this list stops being listed.',
      why: 'Nothing that is running is stopped, and no file is touched. This is only the note of what you opened.',
      confirm: 'Clear it',
    });
    if (!sure) return;
    say(await api('/tidy'));
    draw();
  });

  for (const b of document.querySelectorAll('[data-done]')) {
    b.onclick = async () => { await api('/done', { effort: b.dataset.done }); draw(); };
  }
  for (const b of document.querySelectorAll('[data-drop]')) {
    b.onclick = async () => { await api('/drop', { effort: b.dataset.drop }); draw(); };
  }
}

async function saveAndSend() {
  const button = $('#pub');
  button.disabled = true;
  button.textContent = 'Saving…';
  say(await api('/publish', { message: $('#msg').value.trim() }));
  draw();
}

function gitHubSheet(p) {
  const s = p.situation ?? {};
  const has = !!s.shared;

  const options = [
    { id: 'save', glyph: '⌂', what: 'Save here only', can: true,
      why: 'Keep a point you can come back to, without sending it anywhere.' },
    { id: 'latest', glyph: '↓', what: 'Get the latest from GitHub', can: has,
      why: has ? 'Bring down anything your other computers have sent. Refuses if you have unsaved work.'
        : 'Nothing to get — this project has no copy on GitHub yet.' },
    { id: 'copy', glyph: '＋', what: 'Make a copy on GitHub', can: !has,
      why: has ? 'It already has one.' : 'Puts this project on your GitHub account so it is safe and reachable.' },
    { id: 'visibility', glyph: '◎',
      what: s.visibility === 'public' ? 'Make it private again' : 'Let anyone see it', can: has,
      why: has ? (s.visibility === 'public'
        ? 'Right now anyone with the address can read it. This puts it back to just you.'
        : 'Right now only you can see it. This makes it readable by anybody.')
        : 'It needs a copy on GitHub first.' },
    { id: 'undo', glyph: '↺', what: 'Take back the last save', can: (s.saves ?? 0) > 1 || !has,
      why: 'Undoes the act of saving. Every file stays exactly as it is. Only works if it has not gone to GitHub.' },
    { id: 'changes', glyph: '≡', what: 'See what changed', can: true,
      why: 'A plain list of every file that is different since you last saved.' },
    { id: 'open', glyph: '↗', what: 'Open it on GitHub', can: has,
      why: has ? 'In your browser.' : 'It needs a copy on GitHub first.' },
    { id: 'allow', glyph: '🔑', what: 'Let this computer send to GitHub', can: true,
      why: 'If sending says it cannot prove who you are, this fixes it for every project on this computer. Asked once.' },
  ];

  sheet({
    title: `${p.name} and GitHub`,
    body: `
      <p class="sub" style="margin-bottom:1rem">
        GitHub is where a second copy of your work lives, so a lost laptop is an
        inconvenience rather than a disaster — and it is how your other computers
        get what you did here.
      </p>
      <div class="menu">
        ${options.map((o) => `
          <button class="opt" data-do="${o.id}" ${o.can ? '' : 'disabled'}>
            <span class="glyph">${o.glyph}</span>
            <span><span class="what">${esc(o.what)}</span><br><span class="why">${esc(o.why)}</span></span>
          </button>`).join('')}
      </div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-do]')) b.onclick = () => doGitHub(b.dataset.do, p);
    },
  });
}

async function doGitHub(what, p) {
  const s = p.situation ?? {};

  if (what === 'changes') { closeLayer(); return statusSheet(p.dir); }

  if (what === 'allow') {
    closeLayer();
    const sure = await confirmThat({
      title: 'Let this computer send to GitHub',
      what: 'This computer will use the GitHub account you are signed in to here whenever it sends anything.',
      why: 'It changes one setting for every project on this computer, and it is the setting GitHub itself recommends. Nothing about your projects changes.',
      confirm: 'Set it up',
    });
    if (!sure) return;
    say(await api('/github/allowSending'));
    return draw();
  }

  if (what === 'open') {
    closeLayer();
    const picture = await api('/github');
    if (picture.picture?.url) window.open(picture.picture.url, '_blank');
    return;
  }

  if (what === 'save') {
    closeLayer();
    const message = await ask({
      title: 'Save here only',
      label: 'What did you do?',
      value: $('#msg')?.value ?? '',
      placeholder: 'Made the sign-in page work',
      confirm: 'Save it',
    });
    if (message === null) return;
    say(await api('/github/save', { message }));
    return draw();
  }

  if (what === 'copy') {
    closeLayer();
    const keepPrivate = await confirmThat({
      title: 'Make a copy on GitHub',
      what: `${p.name} will get a copy on your GitHub account.`,
      why: 'Choose whether anyone can see it. You can change this later either way.',
      confirm: 'Only I can see it',
    });
    say(await api('/github/copy', { visibility: keepPrivate ? 'private' : 'public' }));
    return draw();
  }

  if (what === 'visibility') {
    closeLayer();
    const toPublic = s.visibility !== 'public';
    const sure = !toPublic || !me.settings?.confirmPublic || await confirmThat({
      title: 'Let anyone see it',
      what: `Anybody who finds ${p.name} on GitHub will be able to read all of it.`,
      why: 'Check there are no passwords or keys in the files first. Once it is out, assume somebody has a copy.',
      confirm: 'Yes, let anyone see it',
      danger: true,
    });
    if (!sure) return;
    say(await api('/github/visibility', { visibility: toPublic ? 'public' : 'private' }));
    return draw();
  }

  if (what === 'undo') {
    closeLayer();
    const sure = await confirmThat({
      title: 'Take back the last save',
      what: 'The last save is undone.',
      why: 'Nothing you have written is lost — every file stays exactly as it is now. Only the save itself goes.',
      confirm: 'Take it back',
      danger: true,
    });
    if (!sure) return;
    say(await api('/github/undo'));
    return draw();
  }

  if (what === 'latest') {
    closeLayer();
    say({ sentence: 'Getting the latest…' });
    draw();
    say(await api('/github/latest'));
    return draw();
  }
}

// ---------------------------------------------------------------------------
// AI apps
// ---------------------------------------------------------------------------

SCREENS.apps = async () => {
  const [t, p] = await Promise.all([api('/tools'), api('/project')]);
  const here = t.tools.filter((x) => x.here);
  const away = t.tools.filter((x) => !x.here);

  view.innerHTML = `
    <h1>AI apps</h1>
    <p class="sub">Each one opens already inside the folder shown on its card, with the
      account you picked. You never add the folder by hand again.</p>
    ${whereBar(p)}
    ${saidHtml()}

    ${here.length ? `
      <h2>On this computer</h2>
      <div class="grid">${here.map((x) => appTile(x, p, t)).join('')}</div>` : `
      <div class="empty"><b>None of the AI apps were found here.</b>
        Any of the ones below can be installed from this page.</div>`}

    ${away.length ? `
      <h2>Not on this computer</h2>
      <div class="grid">${away.map((x) => appTile(x, p, t)).join('')}</div>` : ''}

    <div id="job"></div>`;
  said = null;

  wireWhereBar();
  wireAppCards(t, p);
  if (watching) paintJob();
};

/**
 * Which folder everything on this page will start in.
 *
 * One choice for the page rather than one per card. Every card said the same
 * thing, which is a lot of ink to say one fact.
 */
function whereBar(p) {
  const dir = chosen.folder.all ?? p.dir ?? null;
  return `
    <div class="bar">
      <span style="color:var(--quiet);font-size:.86rem">Start in</span>
      <button class="folderchip" id="where-all">
        <span>📁</span><b>${esc(dir ? tail(dir) : 'no folder chosen')}</b>
        <span style="color:var(--faint)">${esc(dir ?? 'pick one')}</span>
      </button>
      ${chosen.folder.all ? '<button class="quiet small" id="where-clear">use the open project</button>' : ''}
    </div>`;
}

function wireWhereBar() {
  $('#where-all')?.addEventListener('click', async () => {
    const path = await pickFolder({ title: 'Start everything in which folder?', confirm: 'Start in here' });
    if (!path) return;
    chosen.folder.all = path;
    draw();
  });
  $('#where-clear')?.addEventListener('click', () => { delete chosen.folder.all; draw(); });
}

const whereFor = (id, p) => chosen.folder.all ?? p?.dir ?? null;

function appTile(x, p, t) {
  const ways = x.ways ?? [];
  const account = chosen.account[x.id] ?? x.active ?? null;

  if (!x.here) {
    return `
      <div class="tile flat away">
        <div class="top"><span class="dot off"></span><span class="title">${esc(x.name)}</span>
          ${x.made ? `<span class="chip" style="margin-left:auto">${esc(x.made)}</span>` : ''}</div>
        <div class="note">Not on this computer. Its own page has the installer and the steps.</div>
        <div class="doing">
          <button class="small" data-getpage="${esc(x.install ?? '')}">How to install ${esc(x.name)} ↗</button>
        </div>
      </div>`;
  }

  // A window this app has but this computer does not still gets its button. It
  // says where to get it rather than not being there at all.
  const canWindow = ways.includes('desktop');
  const windowElsewhere = !canWindow && x.windowElsewhere;

  return `
    <div class="tile flat">
      <div class="top">
        <span class="dot ${account || x.signedIn ? 'live' : 'off'}"></span>
        <span class="title">${esc(x.name)}</span>
        ${x.made ? `<span class="chip" style="margin-left:auto">${esc(x.made)}</span>` : ''}
      </div>
      <div class="note">${account
    ? `Will open as “${esc(account)}”`
    : x.signedIn ? 'Signed in on this computer'
      : x.config ? 'Not signed in yet' : 'Signs you in inside its own window'}</div>
      ${x.opensInBrowser ? '<div class="note" style="color:var(--faint);font-size:.78rem">Its window is a page it opens in your browser.</div>' : ''}
      ${windowElsewhere ? `<div class="note" style="color:var(--faint);font-size:.78rem">${esc(x.terminalOnlyBecause ?? 'Its own window is not on this computer yet.')}</div>` : ''}

      <div class="doing">
        ${canWindow
    ? `<button class="go small" data-launch="${esc(x.id)}" data-how="desktop">Open</button>`
    : windowElsewhere
      ? `<button class="small" data-getwindow="${esc(x.windowElsewhere)}" data-name="${esc(x.name)}">Open ↗</button>`
      : ''}
        ${ways.includes('terminal') ? `
          <span class="pair">
            <button class="${canWindow ? '' : 'go '}small"
              data-launch="${esc(x.id)}" data-how="terminal">Terminal</button>
            <button class="${canWindow ? '' : 'go '}small" data-which="${esc(x.id)}">▾</button>
          </span>` : ''}
        <span class="drop">
          <button class="small" data-account="${esc(x.id)}">Account ▾</button>
          <div class="panel" hidden id="acct-${esc(x.id)}">${accountPanel(x, t)}</div>
        </span>
      </div>
    </div>`;
}

/**
 * The account panel: the services this app can sign you in with, and the
 * accounts already kept for it. Both in the place you are about to press Open.
 */
function accountPanel(x, t) {
  const services = x.services ?? [];
  const keeps = x.profiles ?? [];
  const account = chosen.account[x.id] ?? x.active ?? null;

  return `
    ${services.length ? `
      <div class="head">Sign in with</div>
      <div class="services">
        ${services.map((s) => `
          <button class="service" data-service="${esc(x.id)}|${esc(s.id)}|${esc(s.at)}">
            <span class="badge" style="background:${esc(s.tint)}">${esc(s.initial)}</span>
            ${esc(s.name)}
          </button>`).join('')}
      </div>` : ''}

    <div class="head">${x.config ? 'Accounts kept on this computer' : 'Accounts'}</div>
    ${!x.config
      ? `<div class="pick"><span class="sub">${esc(x.name)} keeps its account inside itself, so this
           manager cannot hold more than one for it.</span></div>`
      : keeps.length ? keeps.map((k) => `
          <button class="pick ${k.name === account ? 'on' : ''}" data-use="${esc(x.id)}|${esc(k.name)}">
            <span class="dot ${k.name === account ? 'live' : 'off'}"></span>
            <span class="grow"><b>${esc(k.name)}</b><br>
              <span class="sub">${k.active ? 'signed in right now' : `last used ${ago(k.lastUsed)}`}</span></span>
            <span class="sub" data-forget="${esc(x.id)}|${esc(k.name)}">✕</span>
          </button>`).join('')
        : '<div class="pick"><span class="sub">None kept yet. Sign in above, then keep it under a name — after that you can switch without signing out of either.</span></div>'}

    ${x.config ? `<hr>
      <button class="pick" data-keep="${esc(x.id)}"><span>＋</span>
        <span class="grow">Keep the one I am signed in to…</span></button>` : ''}
    ${x.signIn?.way === 'terminal' ? `
      <button class="pick" data-signin="${esc(x.id)}"><span>❯</span>
        <span class="grow">Run ${esc(x.name)}'s own sign-in<br><span class="sub">Opens a terminal, then your browser.</span></span></button>` : ''}`;
}

function wireAppCards(t, p) {
  for (const b of document.querySelectorAll('[data-launch]')) {
    b.onclick = async () => {
      const { launch, how } = b.dataset;
      b.disabled = true;
      say(await api('/launch', {
        tool: launch, how, dir: whereFor(launch, p), profile: chosen.account[launch] ?? null,
      }));
      await draw();
    };
  }

  for (const b of document.querySelectorAll('[data-which]')) {
    b.onclick = () => whichTerminal(b.dataset.which, whereFor(b.dataset.which, p), t.terminals);
  }

  for (const b of document.querySelectorAll('[data-getwindow]')) {
    b.onclick = async () => {
      const go = await confirmThat({
        title: `${b.dataset.name}'s own window`,
        what: `What is installed here is ${b.dataset.name} for the terminal, not its window.`,
        why: 'Its download page has the window version. Once it is installed, this button opens it.',
        confirm: 'Open the download page',
      });
      if (go) window.open(b.dataset.getwindow, '_blank');
    };
  }

  for (const b of document.querySelectorAll('[data-account]')) {
    b.onclick = (e) => {
      e.stopPropagation();
      const panel = $(`#acct-${CSS.escape(b.dataset.account)}`);
      const wasOpen = !panel.hidden;
      closePanels();
      panel.hidden = wasOpen;
    };
  }

  for (const b of document.querySelectorAll('[data-service]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      const [tool, , where] = b.dataset.service.split('|');
      window.open(where, '_blank');
      closePanels();
      say({
        ok: true,
        sentence: 'The sign-in page is opening in your browser.',
        action: `When you are signed in there, run ${t.tools.find((x) => x.id === tool)?.name ?? 'the app'}'s own sign-in to let this computer use it.`,
      });
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-use]')) {
    b.onclick = (e) => {
      if (e.target.dataset.forget) return;
      e.stopPropagation();
      const [tool, name] = b.dataset.use.split('|');
      chosen.account[tool] = name;
      closePanels();
      draw();
    };
  }

  for (const s of document.querySelectorAll('[data-forget]')) {
    s.onclick = async (e) => {
      e.stopPropagation();
      const [tool, name] = s.dataset.forget.split('|');
      const sure = await confirmThat({
        title: 'Throw this account away',
        what: `The kept copy of “${name}” is deleted from this computer.`,
        why: 'You would have to sign in to that account again to get it back.',
        confirm: 'Throw it away',
        danger: true,
      });
      if (!sure) return;
      if (chosen.account[tool] === name) delete chosen.account[tool];
      say(await api('/profile/forget', { tool, name }));
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-keep]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      closePanels();
      const name = await ask({
        title: 'Keep this account',
        label: 'What should it be called? Something you will recognise — “work”, “personal”.',
        placeholder: 'work',
        confirm: 'Keep it',
      });
      if (!name) return;
      say(await api('/profile/save', { tool: b.dataset.keep, name }));
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-signin]')) {
    b.onclick = async (e) => {
      e.stopPropagation();
      closePanels();
      say(await api('/signin/tool', { tool: b.dataset.signin, dir: whereFor(b.dataset.signin, p) }));
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-getpage]')) {
    b.onclick = () => window.open(b.dataset.getpage, '_blank');
  }
}

function whichTerminal(toolId, dir, terminals) {
  sheet({
    title: 'Which terminal?',
    narrow: true,
    body: `<div class="menu">${terminals.map((t) => `
      <button class="opt" data-in="${esc(t.id)}">
        <span class="glyph">❯</span>
        <span><span class="what">${esc(t.name)}</span><br><span class="why">${esc(t.blurb)}</span></span>
      </button>`).join('')}</div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-in]')) {
        b.onclick = async () => {
          closeLayer();
          say(await api('/launch', {
            tool: toolId, how: 'terminal', terminal: b.dataset.in, dir,
            profile: chosen.account[toolId] ?? null,
          }));
          draw();
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Terminals
// ---------------------------------------------------------------------------

SCREENS.terminals = async () => {
  const [{ terminals }, p] = await Promise.all([api('/terminals'), api('/project')]);
  const dir = whereFor(null, p);

  view.innerHTML = `
    <h1>Terminals</h1>
    <p class="sub">Each of these opens already inside the folder above, so the first thing
      you type is the thing you meant to type.</p>
    ${whereBar(p)}
    ${saidHtml()}

    <h2>On this computer</h2>
    <div class="grid">
      ${terminals.map((t) => `
        <div class="tile flat">
          <div class="top"><span class="dot live"></span><span class="title">${esc(t.name)}</span></div>
          <div class="note">${esc(t.blurb)}</div>
          <div class="doing">
            <button class="go small" data-open-term="${esc(t.id)}" ${dir ? '' : 'disabled'}>Open here</button>
          </div>
        </div>`).join('')}
    </div>`;
  said = null;

  wireWhereBar();

  for (const b of document.querySelectorAll('[data-open-term]')) {
    b.onclick = async () => {
      say(await api('/terminal', { terminal: b.dataset.openTerm, dir: whereFor(null, p) }));
      draw();
    };
  }
};

// ---------------------------------------------------------------------------
// Putting it out into the world
// ---------------------------------------------------------------------------

let watching = null;

SCREENS.ship = async () => {
  const d = await api('/ship');
  if (!d.open) {
    view.innerHTML = `<h1>Put it out</h1>
      <div class="empty"><b>No project is open.</b> Pick one first and this page fills in.</div>`;
    return;
  }

  const { site, app } = d;

  view.innerHTML = `
    <h1>Put it out into the world</h1>
    <p class="sub">Two different errands, because they really are different. A website
      lives at an address and gets replaced whole. An application is downloaded and
      installed, and old copies stay out there.</p>
    ${saidHtml()}
    <div class="split">
      <div class="card">
        <h2 style="margin-top:0">A website</h2>
        <p class="note" style="color:var(--quiet);font-size:.88rem">
          People visit an address and see the newest version. Putting up a new one
          replaces the old one everywhere, at once.</p>
        ${site.buildStep ? '<p class="chip cool">this project builds itself first</p>' : ''}
        <div style="margin-top:.8rem">
          ${site.places.map((pl) => `
            <div class="row" style="margin-bottom:.4rem">
              <span class="dot ${pl.ready ? 'live' : 'off'}"></span>
              <div class="grow"><div class="name">${esc(pl.name)}</div>
                <div class="note">${esc(pl.ready ? pl.blurb : pl.missing ?? pl.blurb)}</div></div>
              <button class="${pl.ready ? 'go ' : ''}small" data-site="${esc(pl.id)}" ${pl.ready ? '' : 'disabled'}>Put it up</button>
            </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2 style="margin-top:0">An application</h2>
        <p class="note" style="color:var(--quiet);font-size:.88rem">
          People download a file and install it. Whatever they installed stays installed
          until they take a newer one, so every version you put out lives on.</p>
        ${app.packStep
          ? `<p class="chip cool">builds with this project's own “${esc(app.packStep)}” step</p>`
          : '<p class="chip attention">this project does not say how to build itself yet</p>'}
        ${app.installers.length ? `
          <div style="margin-top:.8rem">
            ${app.installers.map((f) => `
              <div class="row" style="margin-bottom:.4rem">
                <span class="dot live"></span>
                <div class="grow"><div class="name">${esc(f.name)}</div>
                  <div class="note">${esc(size(f.size))} · already built, in ${esc(f.where)}</div></div>
              </div>`).join('')}
          </div>` : ''}
        <div class="bar" style="margin:.8rem 0 0">
          <button class="go small" id="app-build" ${app.packStep || app.manager === 'cargo' ? '' : 'disabled'}>Build it</button>
          <button class="small" id="app-out" ${app.canRelease && (app.packStep || app.installers.length) ? '' : 'disabled'}>Build and give it out</button>
        </div>
        ${app.canRelease ? '' : `
          <p class="note" style="color:var(--quiet);font-size:.85rem;margin-top:.6rem">
            Giving it out needs a copy of this project on GitHub, and you signed in to it.</p>`}
      </div>
    </div>

    <div id="job"></div>`;
  said = null;

  for (const b of document.querySelectorAll('[data-site]')) {
    b.onclick = async () => {
      const r = await api('/ship/site', { place: b.dataset.site });
      if (r.ok) watchJob(r.job); else { say(r); draw(); }
    };
  }
  $('#app-build').onclick = async () => {
    const r = await api('/ship/app', { giveOut: false });
    if (r.ok) watchJob(r.job); else { say(r); draw(); }
  };
  $('#app-out').onclick = async () => {
    const version = await ask({
      title: 'Give it out',
      label: 'What version is this? People will see this number.',
      value: app.version ?? '1.0.0',
      confirm: 'Build and give it out',
    });
    if (!version) return;
    const r = await api('/ship/app', { giveOut: true, version });
    if (r.ok) watchJob(r.job); else { say(r); draw(); }
  };

  if (watching) paintJob();
};

async function watchJob(id) {
  watching = id;
  await paintJob();
}

async function paintJob() {
  const box = $('#job');
  if (!box || !watching) return;
  const j = await api(`/job?id=${encodeURIComponent(watching)}`);
  if (j.ok === false && !j.lines) { watching = null; return; }

  box.innerHTML = `
    <h2>${esc(j.what)}</h2>
    <div class="card">
      <div class="bar" style="margin-bottom:.7rem">
        ${j.running ? '<span class="spin"></span>' : `<span class="dot ${j.ok ? 'live' : 'trouble'}"></span>`}
        <b>${esc(j.running ? 'Working on it. This can take a few minutes.' : j.sentence ?? '')}</b>
        <span style="flex:1"></span>
        ${j.running ? '' : '<button class="quiet small" id="job-close">clear</button>'}
      </div>
      ${j.action && !j.running ? `<p class="note" style="color:var(--quiet);margin:0 0 .7rem">${esc(j.action)}</p>` : ''}
      <ul class="steps">${j.steps.map((s) => `<li><span class="tick">✓</span> ${esc(s.sentence)}</li>`).join('')}</ul>
      <details ${j.ok === false ? 'open' : ''}>
        <summary style="cursor:pointer;color:var(--quiet);font-size:.85rem">What it printed</summary>
        <div class="log" style="margin-top:.5rem">${esc(j.lines.join('\n'))}</div>
      </details>
    </div>`;

  $('#job-close')?.addEventListener('click', () => { watching = null; draw(); });

  if (j.running) setTimeout(paintJob, 1000);
  else setTimeout(() => { if (!layer.innerHTML) draw(); }, 600);
}

// ---------------------------------------------------------------------------
// Shared workspace
// ---------------------------------------------------------------------------

let workspaceTimer = null;

SCREENS.workspace = async () => {
  clearTimeout(workspaceTimer);
  const w = await api('/workspace');

  if (!w.joined) {
    view.innerHTML = `
      <h1>Shared workspace</h1>
      <p class="sub">Every computer signed in to the same GitHub account, in one place —
        and folders that go straight from one to another across your own network.</p>
      ${saidHtml()}
      <div class="card">
        <p style="margin-top:0">Joining makes one small private project on your own GitHub
          account called <b>viberant-workspace</b>. Every computer you sign in on puts three
          things in it: who it is, which projects it is offering, and anything you type here.
          There is no service of ours in the middle.</p>
        <p style="color:var(--quiet);font-size:.89rem">It also puts one random number in there,
          which is what lets two computers on the same network recognise each other as
          <b>yours</b> — being signed in to the same account is a claim anybody nearby could
          make, and holding a number out of a project only you can read is not.</p>
        <p style="color:var(--quiet);font-size:.89rem">Folders never go through GitHub. They go
          straight from one computer to the other across your own network, and only when
          somebody asks for one.</p>
        <div class="bar" style="margin:1rem 0 0">
          <button class="go" id="w-join" ${me.github ? '' : 'disabled'}>Join my shared workspace</button>
          ${me.github ? '' : '<span class="note" style="color:var(--quiet)">Sign in to GitHub first — the account button is at the bottom left.</span>'}
        </div>
      </div>`;
    said = null;
    $('#w-join')?.addEventListener('click', async () => {
      const b = $('#w-join');
      b.disabled = true;
      b.textContent = 'Joining…';
      say(await api('/workspace/join'));
      await refreshMe();
      draw();
    });
    return;
  }

  const known = w.machines ?? [];
  const nearby = new Map((w.around ?? []).map((m) => [m.machine, m]));
  const mine = known.find((m) => m.you);
  const others = known.filter((m) => !m.you);
  const theirs = (w.projects ?? []).filter((p) => !p.yours);
  const reachable = others.filter((m) => nearby.has(m.id)).length;

  view.innerHTML = `
    <h1>Shared workspace</h1>
    <p class="sub">Every computer signed in to <b>${esc(w.account ?? '')}</b> on GitHub.
      Folders move straight between them across this network — never through GitHub.
      ${w.mismatch ? '<b style="color:var(--attention)">You are signed in as somebody else right now, so this is out of step.</b>' : ''}</p>
    ${saidHtml()}

    <div class="tally">
      <div class="one"><b>${known.length}</b><span>computer${known.length === 1 ? '' : 's'} in all</span></div>
      <div class="one ${reachable ? '' : 'warn'}"><b>${reachable}</b><span>reachable on this network</span></div>
      <div class="one"><b>${(w.offers ?? []).length}</b><span>folder${(w.offers ?? []).length === 1 ? '' : 's'} you are offering</span></div>
      <div class="grow"></div>
      <div class="one">
        <b style="font-size:1rem;line-height:2">${w.sharingHere ? '● on' : '○ off'}</b>
        <span>this computer can be reached</span>
      </div>
    </div>

    <h2>Your other computers</h2>
    ${others.length ? `<div class="lane">${others.map((m) => {
    const near = nearby.get(m.id);
    return `
      <div class="slab" style="cursor:default">
        <span class="dot ${near ? 'live' : m.hereNow ? 'attention' : 'off'}"></span>
        <div class="grow">
          <div class="line1"><b>${esc(m.name)}</b>
            <span class="chip">${esc(m.kind ?? '')}</span>
            ${near ? '<span class="chip live">on this network</span>' : ''}</div>
          <div class="fact">${near ? 'Here now, and folders can move both ways.'
      : m.hereNow ? 'Signed in, but not on this network — notes travel, folders cannot.'
        : `Last seen ${ago(m.lastHere)}.`}</div>
          ${m.workingOn ? `<div class="did">Working on ${esc(m.workingOn)}</div>` : ''}
        </div>
        <div class="acts">
          ${near ? `<button class="go small" data-peek="${esc(m.id)}">See what it is offering</button>` : ''}
        </div>
      </div>`;
  }).join('')}</div>`
    : `<div class="empty"><b>Only this computer so far.</b>
         Install Viberant on another one, sign in to the same GitHub account, and press Join there.</div>`}

    <h2>This computer</h2>
    <div class="slab" style="cursor:default">
      <span class="dot ${w.sharingHere ? 'live' : 'off'}"></span>
      <div class="grow">
        <div class="line1"><b>${esc(mine?.name ?? me.machineName)}</b>
          <span class="chip vibe">this one</span></div>
        <div class="fact">${w.sharingHere
    ? 'Your other computers can find this one and ask it for what it offers.'
    : 'Not reachable by your other computers at the moment.'}</div>
      </div>
      <div class="acts">
        <button class="small" id="w-rename">Rename</button>
        ${w.sharingHere ? '' : '<button class="go small" id="w-share-on">Let the others reach it</button>'}
      </div>
    </div>

    <h2>Folders this computer is offering</h2>
    ${(w.offers ?? []).length ? `<div class="lane">${(w.offers ?? []).map((o) => `
      <div class="slab" style="cursor:default">
        <span class="dot live"></span>
        <div class="grow">
          <div class="line1"><b>${esc(o.name)}</b>
            <span class="chip">${o.files} files</span>
            <span class="chip">${esc(size(o.bytes))}</span>
            ${o.everything ? '<span class="chip">everything included</span>' : ''}</div>
          <div class="fact">Any of your computers on this network can take a copy — when it asks.</div>
          <div class="path">${esc(o.path ?? '')}</div>
        </div>
        <div class="acts"><button class="quiet small" data-unoffer="${esc(o.id)}">Stop offering</button></div>
      </div>`).join('')}</div>`
    : `<div class="empty"><b>Nothing offered yet.</b>
         Offer a folder and your other computers can take a copy. Nothing moves until one asks.</div>`}
    <div class="bar" style="margin-top:.6rem">
      <button class="go" id="w-offer-folder">Offer a folder…</button>
    </div>

    <h2>Projects your other computers have</h2>
    ${theirs.length ? `<div class="lane">${theirs.map((p) => `
      <div class="slab" style="cursor:default">
        <span class="dot ${p.url ? 'live' : 'off'}"></span>
        <div class="grow">
          <div class="line1"><b>${esc(p.name)}</b>
            ${p.kind ? `<span class="chip">${esc(p.kind)}</span>` : ''}
            <span class="chip">on ${esc(p.fromName)}</span></div>
          <div class="fact">${esc(p.says ?? '')}</div>
          ${p.lastDid ? `<div class="did">Last time: ${esc(p.lastDid)}</div>` : ''}
          ${p.url ? '' : '<div class="did">No copy on GitHub — ask that computer to offer the folder instead.</div>'}
        </div>
        <div class="acts">
          <button class="small" data-bring='${esc(JSON.stringify(p))}' ${p.url ? '' : 'disabled'}>Bring it from GitHub</button>
        </div>
      </div>`).join('')}</div>`
    : `<div class="empty"><b>Nothing listed yet.</b>
         Every project on your other computers shows here unless it is marked private there.</div>`}

    <h2>Notes between your computers</h2>
    <div class="card">
      <div class="talk" id="talk">
        ${(w.said ?? []).map((s) => `
          <div class="bubble ${s.you ? 'mine' : ''}">
            <div style="font-size:.74rem;color:var(--faint)">${esc(s.fromName)} · ${ago(s.at)}</div>
            ${esc(s.text)}
          </div>`).join('') || '<p style="color:var(--quiet);margin:0">Nothing said yet. Leave a note for whichever computer you sit at next.</p>'}
      </div>
      <div class="bar" style="margin:.8rem 0 0">
        <input id="w-say" placeholder="Leave a note for your other computer" style="flex:1">
        <button class="go" id="w-send">Say it</button>
      </div>
    </div>

    <div class="bar" style="margin-top:1.6rem">
      <button class="quiet small" id="w-refresh">Check again now</button>
      <button class="quiet small danger" id="w-leave">Take this computer out of the workspace</button>
    </div>

    <div id="job"></div>`;
  said = null;

  const talk = $('#talk');
  if (talk) talk.scrollTop = talk.scrollHeight;

  $('#w-say').onkeydown = (e) => { if (e.key === 'Enter') $('#w-send').click(); };
  $('#w-send').onclick = async () => {
    const text = $('#w-say').value.trim();
    if (!text) return;
    $('#w-say').value = '';
    const r = await api('/workspace/say', { text });
    if (!r.ok) say(r);
    draw();
  };
  $('#w-refresh').onclick = async () => { await api('/workspace/refresh'); draw(); };
  $('#w-share-on')?.addEventListener('click', async () => { say(await api('/local/on')); await refreshMe(); draw(); });
  $('#w-rename')?.addEventListener('click', async () => {
    const name = await ask({
      title: 'Name this computer',
      label: 'What should your other computers call it?',
      value: me.machineName,
      confirm: 'Call it that',
    });
    if (!name) return;
    say(await api('/settings', { id: 'machineName', value: name }));
    await api('/workspace/refresh');
    await refreshMe();
    draw();
  });
  $('#w-offer-folder').onclick = offerFolder;
  $('#w-leave').onclick = async () => {
    const sure = await confirmThat({
      title: 'Take this computer out',
      what: 'This computer stops appearing to the others.',
      why: 'Nothing on it is touched, and nothing of yours on GitHub is deleted. You can join again whenever.',
      confirm: 'Take it out',
      danger: true,
    });
    if (!sure) return;
    say(await api('/workspace/leave'));
    await refreshMe();
    draw();
  };

  for (const b of document.querySelectorAll('[data-peek]')) b.onclick = () => peekAt(b.dataset.peek, w);
  for (const b of document.querySelectorAll('[data-unoffer]')) {
    b.onclick = async () => { say(await api('/local/withdraw', { id: b.dataset.unoffer })); draw(); };
  }
  for (const b of document.querySelectorAll('[data-bring]')) {
    b.onclick = async () => {
      const entry = JSON.parse(b.dataset.bring);
      const into = await pickFolder({ title: `Where should ${entry.name} go?`, confirm: 'Put it in here', startAt: w.workFolder });
      if (!into) return;
      say({ sentence: `Bringing ${entry.name} to this computer…` });
      draw();
      say(await api('/workspace/bring', { entry, into }));
      await refreshMe();
      draw();
    };
  }

  if (watching) paintJob();
  workspaceTimer = setTimeout(() => {
    if (at.tab === 'workspace' && !layer.innerHTML && !watching) draw();
  }, 20000);
};

/** Offer a folder to the other computers on this network. */
async function offerFolder() {
  const path = await pickFolder({ title: 'Which folder do you want to offer?', confirm: 'Offer this folder' });
  if (!path) return;

  const light = await api('/local/weigh', { path, everything: false });
  const heavy = await api('/local/weigh', { path, everything: true });

  sheet({
    title: `Offer ${tail(path)}`,
    narrow: true,
    body: `
      <p class="sub">Your other computers will see this in their list. Nothing moves until
        one of them asks for it, and it goes straight across your network — never through
        GitHub and never through anything of ours.</p>
      <div class="menu">
        <button class="opt" data-offer="0">
          <span class="glyph">◔</span>
          <span><span class="what">Just the work — ${esc(light.says)}</span><br>
            <span class="why">Leaves out the folders that get rebuilt anyway, like node_modules and build output.
              ${light.skipped ? `${light.skipped} of them here.` : ''}</span></span>
        </button>
        <button class="opt" data-offer="1">
          <span class="glyph">●</span>
          <span><span class="what">Everything — ${esc(heavy.says)}</span><br>
            <span class="why">Exactly what is in the folder, including everything that could be rebuilt.</span></span>
        </button>
      </div>`,
    onOpen: () => {
      for (const b of document.querySelectorAll('[data-offer]')) {
        b.onclick = async () => {
          closeLayer();
          say(await api('/local/offer', { path, everything: b.dataset.offer === '1' }));
          draw();
        };
      }
    },
  });
}

/** What one of your computers has on offer right now. */
async function peekAt(machineId, w) {
  const which = (w.machines ?? []).find((m) => m.id === machineId);
  sheet({
    title: `What ${which?.name ?? 'it'} is offering`,
    body: '<div class="row"><span class="spin"></span><div class="grow">Asking it…</div></div>',
    onOpen: async (body) => {
      const r = await api(`/local/offers?machine=${encodeURIComponent(machineId)}`);
      if (!r.ok) {
        body.innerHTML = `<p><b>${esc(r.sentence)}</b><br><span style="color:var(--quiet)">${esc(r.action ?? '')}</span></p>`;
        return;
      }
      if (!r.offers.length) {
        body.innerHTML = `<div class="empty"><b>${esc(r.from)} is not offering anything.</b>
          On that computer, use “Offer a folder” and it will show up here.</div>`;
        return;
      }
      body.innerHTML = `
        <p class="sub">Choose one and say where it should go. It comes straight across your
          network. Nothing on this computer is changed until you pick a folder.</p>
        ${r.offers.map((o) => `
          <div class="row">
            <span class="dot live"></span>
            <div class="grow"><div class="name">${esc(o.name)}</div>
              <div class="note">${o.files} files · ${esc(size(o.bytes))}${o.everything ? ' · everything included' : ''}
                ${o.about ? ` · ${esc(o.about)}` : ''}</div></div>
            <button class="go small" data-take="${esc(o.id)}" data-name="${esc(o.name)}">Bring it here…</button>
          </div>`).join('')}`;

      for (const b of body.querySelectorAll('[data-take]')) {
        b.onclick = async () => {
          closeLayer();
          const into = await pickFolder({
            title: `Where should ${b.dataset.name} go on this computer?`,
            confirm: 'Put it in here',
            startAt: w.workFolder,
          });
          if (!into) return;
          const started = await api('/local/take', {
            machine: machineId, offer: b.dataset.take, name: b.dataset.name, into,
          });
          if (started.ok) watchJob(started.job); else { say(started); draw(); }
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

SCREENS.settings = async () => {
  const [{ settings, record }, { terminals }] = await Promise.all([api('/settings'), api('/terminals')]);

  view.innerHTML = `
    <h1>Settings</h1>
    <p class="sub">Everything here changes how the manager behaves, never what it tells you
      is true.</p>
    ${saidHtml()}

    <div class="card">
      ${settings.map((s) => `
        <div class="setting">
          <div class="about"><b>${esc(s.name)}</b><span>${esc(s.why)}</span></div>
          <div class="set">${control(s, terminals)}</div>
        </div>`).join('')}
    </div>

    <h2>This computer</h2>
    <div class="card">
      <div class="setting">
        <div class="about"><b>Everything the manager has written down</b>
          <span>A folder of plain text files. Open it in Explorer, read any of it, delete the
            folder and it is as if this never ran.</span></div>
        <div class="set"><button class="small" id="open-record">Open the folder</button></div>
      </div>
      <div class="setting">
        <div class="about"><b>Where it keeps them</b><span>${esc(record)}</span></div>
        <div class="set"></div>
      </div>
      <div class="setting">
        <div class="about"><b>Put every setting back</b>
          <span>Only the settings above. Your projects, accounts and history are untouched.</span></div>
        <div class="set"><button class="small danger" id="reset">Put them back</button></div>
      </div>
    </div>`;
  said = null;

  for (const b of document.querySelectorAll('[data-toggle]')) {
    b.onclick = async () => {
      await api('/settings', { id: b.dataset.toggle, value: b.dataset.now !== '1' });
      await refreshMe();
      draw();
    };
  }
  for (const b of document.querySelectorAll('[data-text]')) {
    b.onclick = async () => {
      const value = await ask({
        title: b.dataset.title,
        label: b.dataset.title,
        value: b.dataset.value,
        confirm: 'Save',
      });
      if (!value) return;
      say(await api('/settings', { id: b.dataset.text, value }));
      await refreshMe();
      draw();
    };
  }
  for (const b of document.querySelectorAll('[data-folder]')) {
    b.onclick = async () => {
      const path = await pickFolder({ title: b.dataset.title, confirm: 'Use this folder', startAt: b.dataset.value });
      if (!path) return;
      say(await api('/settings', { id: b.dataset.folder, value: path }));
      await refreshMe();
      draw();
    };
  }
  for (const sel of document.querySelectorAll('[data-choose]')) {
    sel.onchange = async () => {
      say(await api('/settings', { id: sel.dataset.choose, value: sel.value }));
      await refreshMe();
      draw();
    };
  }

  $('#open-record').onclick = async () => { say(await api('/settings/openRecord')); draw(); };
  $('#reset').onclick = async () => {
    const sure = await confirmThat({
      title: 'Put every setting back',
      what: 'Every setting goes back to how it started.',
      why: 'Your projects, your accounts and everything written down are untouched.',
      confirm: 'Put them back',
      danger: true,
    });
    if (!sure) return;
    say(await api('/settings/reset'));
    await refreshMe();
    draw();
  };
};

function control(s, terminals) {
  if (s.kind === 'yesNo') {
    return `<button class="switch ${s.value ? 'on' : ''}" data-toggle="${esc(s.id)}"
      data-now="${s.value ? '1' : '0'}" aria-label="${esc(s.name)}"></button>`;
  }
  if (s.kind === 'choice') {
    return `<select data-choose="${esc(s.id)}">
      ${s.choices.map((c) => `<option value="${esc(c.id)}" ${c.id === s.value ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
    </select>`;
  }
  if (s.kind === 'terminal') {
    return `<select data-choose="${esc(s.id)}">
      <option value="">Whichever is here</option>
      ${terminals.map((t) => `<option value="${esc(t.id)}" ${t.id === s.value ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
    </select>`;
  }
  if (s.kind === 'folder') {
    return `<button class="small" data-folder="${esc(s.id)}" data-title="${esc(s.name)}"
      data-value="${esc(s.value ?? '')}">${esc(tail(s.value) || 'Choose…')}</button>`;
  }
  return `<button class="small" data-text="${esc(s.id)}" data-title="${esc(s.name)}"
    data-value="${esc(s.value ?? '')}">${esc(s.value || 'Set…')}</button>`;
}

// ---------------------------------------------------------------------------
// Noticing the folder changed underneath us
// ---------------------------------------------------------------------------

let lastPulse = null;

async function checkPulse() {
  if (document.hidden || layer.innerHTML || watching) return;
  try {
    const { pulse } = await api('/pulse');
    if (lastPulse !== null && pulse !== lastPulse && at.tab === 'projects') await draw();
    lastPulse = pulse;
  } catch { /* the server is starting or stopping; nothing to say about it */ }
}
setInterval(checkPulse, 4000);

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'Escape') {
    if (layer.innerHTML) closeLayer();
    else if (document.querySelector('.panel:not([hidden])')) closePanels();
    else if (at.inside) { at.inside = false; api('/close').then(refreshMe).then(draw); }
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= TABS.length) go(TABS[n - 1].id);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const start = async () => {
  await refreshMe();
  const p = await api('/project');
  at.inside = !!p.open;
  await draw();

  const skip = me.settings?.opening === false
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    $('#opening')?.classList.add('going');
    $('#frame').classList.add('up');
    setTimeout(() => $('#opening')?.remove(), 500);
  }, skip ? 120 : 1750);
};

start();
