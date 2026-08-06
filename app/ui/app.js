/**
 * The page.
 *
 * It holds no truth. Everything on screen came from the server a moment ago and
 * everything you press goes straight back to it. That is deliberate: if this
 * file kept its own idea of how things stand, it would eventually show you
 * something that is not true, and being believable is the whole product.
 *
 * The shape of every answer from the server is the same — it either worked, or
 * it comes back with one plain sentence and one thing to do about it. There is
 * exactly one place in here that renders that, and no other error path.
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

const size = (bytes) => (bytes > 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.round(bytes / 1e3)} KB`);

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
  { id: 'accounts', name: 'Accounts', glyph: '☺' },
  { id: 'ship', name: 'Put it out', glyph: '↗' },
  { id: 'workspace', name: 'My computers', glyph: '⌸' },
];

const at = { tab: 'projects', inside: false };
let me = { machine: null, machineName: '', github: null, workspace: {}, current: null };

async function refreshMe() {
  me = await api('/me');
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
    <div class="foot">
      <b>${esc(me.machineName || 'This computer')}</b>
      ${me.github ? `signed in as ${esc(me.github)}` : 'not signed in to GitHub'}
      ${me.current ? `<br>open: ${esc(me.current.split(/[\\/]/).pop())}` : ''}
    </div>`;

  for (const b of document.querySelectorAll('[data-tab]')) {
    b.onclick = () => go(b.dataset.tab);
  }
}

const SCREENS = {};

async function go(tab, { keepSaid = false } = {}) {
  at.tab = tab;
  if (!keepSaid) said = null;
  drawNav();
  await draw();
}

async function draw() {
  const render = SCREENS[at.tab];
  if (render) await render();
}

// ---------------------------------------------------------------------------
// Layers: a sheet, a question, a folder
// ---------------------------------------------------------------------------

function closeLayer() { layer.innerHTML = ''; }

/**
 * A sheet. `build` gets a place to put its body and a way to close.
 * Everything modal in this app is one of these — there is no other kind.
 */
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
 * The browser's own box for this does not exist inside the app's own window,
 * so asking for it would silently do nothing. This is that, in the app.
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

/** Ask a yes or no question, with the cost of yes spelled out. */
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

/**
 * Pick a folder by clicking down to it.
 *
 * Two ways out of the same sheet: walk the list, or hand it to the folder
 * chooser this computer already has. Nobody types a path here.
 */
function pickFolder({ title = 'Choose a folder', confirm = 'Open this folder' } = {}) {
  return new Promise((resolve) => {
    let herePath = null;

    const paint = async (path) => {
      const box = $('#walk-box');
      box.innerHTML = '<div class="item"><span class="spin"></span> looking…</div>';
      const r = await api(`/browse?at=${encodeURIComponent(path ?? '')}`);
      if (!r.ok) {
        box.innerHTML = `<div class="item">${esc(r.sentence)}</div>`;
        return;
      }
      herePath = r.at;
      $('#walk-here').textContent = r.at;
      $('#walk-up').disabled = !r.up;
      $('#walk-take').textContent = r.project ? `${confirm} ✓ looks like a project` : confirm;
      box.innerHTML = r.folders.length
        ? r.folders.map((f) => `
            <div class="item" data-into="${esc(f.path)}">
              <span class="leaf">${f.project ? '◆' : '▸'}</span>
              <span class="grow">${esc(f.name)}</span>
              ${f.project ? '<span class="chip">a project</span>' : ''}
            </div>`).join('')
        : '<div class="item"><span class="leaf">·</span> nothing inside this one</div>';

      for (const item of box.querySelectorAll('[data-into]')) {
        item.onclick = () => paint(item.dataset.into);
      }
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
          const r = await api('/browse/choose', { startAt: herePath });
          if (r.ok) { closeLayer(); resolve(r.path); return; }
          if (!r.cancelled) { say(r); closeLayer(); resolve(null); draw(); }
        };

        const { places } = await api('/browse/starts');
        $('#walk-starts').innerHTML = places
          .map((p) => `<button class="small" data-start="${esc(p.path)}">${esc(p.name)}</button>`).join('');
        for (const b of document.querySelectorAll('[data-start]')) {
          b.onclick = () => paint(b.dataset.start);
        }
        await paint(places[0]?.path ?? null);
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
  view.innerHTML = `
    <h1>Your projects</h1>
    <p class="sub">Pick one, and every app on this computer opens already inside it.</p>

    <div class="bar">
      <button class="go" id="p-add">Choose a folder…</button>
      <button id="p-scan">Find all the projects in a folder…</button>
      ${me.github ? '<button id="p-cloud">Bring one down from GitHub…</button>' : ''}
    </div>
    ${saidHtml()}

    ${d.projects.length ? `
      <h2>${d.projects.length} project${d.projects.length === 1 ? '' : 's'}</h2>
      <div class="grid">
        ${d.projects.map(projectTile).join('')}
      </div>`
    : `<div class="empty"><b>Nothing here yet.</b>
         Choose a folder above and it becomes the project every app opens into.</div>`}`;
  said = null;

  $('#p-add').onclick = async () => {
    const path = await pickFolder();
    if (path) await openProject(path);
  };
  $('#p-scan').onclick = async () => {
    const path = await pickFolder({ title: 'Which folder holds your projects?', confirm: 'Look inside this one' });
    if (!path) return;
    const r = await api(`/look?in=${encodeURIComponent(path)}`);
    if (!r.found.length) {
      say({ ok: false, sentence: 'No projects were found in there.', action: 'Try the folder that holds all your work.' });
      return draw();
    }
    for (const f of r.found) await api('/open', { path: f.path });
    await api('/close');
    say({ ok: true, sentence: `Found ${r.found.length} project${r.found.length === 1 ? '' : 's'} and kept them all.` });
    draw();
  };
  $('#p-cloud')?.addEventListener('click', fromGitHub);

  for (const el of document.querySelectorAll('[data-open]')) {
    el.onclick = (e) => { if (e.target.closest('button')) return; openProject(el.dataset.open); };
  }
  for (const b of document.querySelectorAll('[data-mark]')) {
    b.onclick = () => markSheet(b.dataset.mark, d.marks);
  }
  for (const b of document.querySelectorAll('[data-look]')) {
    b.onclick = () => statusSheet(b.dataset.look);
  }
};

function projectTile(p) {
  const look = MARK_LOOK[p.mark];
  return `
    <div class="tile" data-open="${esc(p.path)}">
      <div class="top">
        <span class="dot ${p.unsaved ? 'attention' : 'live'}"></span>
        <span class="title">${esc(p.name)}</span>
        ${look ? `<span class="chip ${look.chip}" style="margin-left:auto">${esc(look.name)}</span>` : ''}
      </div>
      <div class="where">${esc(p.path)}</div>
      <div class="note">${esc(p.says)}</div>
      <div class="note" style="color:var(--faint)">${esc(p.saved)}${p.shared ? ' · has a copy on GitHub' : ' · only on this computer'}</div>
      <div class="foot">
        <button class="small" data-look="${esc(p.path)}">What is in it</button>
        <button class="small" data-mark="${esc(p.path)}">${look ? 'Change mark' : 'Mark it'}</button>
        ${p.offered ? '<span class="chip cool">offered to your other computers</span>' : ''}
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

/** What is actually in a project right now — the pop-up the list points at. */
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
      if (!r.ok) { body.innerHTML = `<p><b>${esc(r.sentence)}</b><br><span style="color:var(--quiet)">${esc(r.action ?? '')}</span></p>`; return; }
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
      <h2>Going on here</h2>
      ${efforts.map((e) => `
        <div class="row">
          <span class="dot ${e.rank === 'moving' ? 'live' : e.rank === 'waiting on you' ? 'attention' : 'off'}"></span>
          <div class="grow"><div class="name">${esc(e.intent)}</div>
            <div class="note">${esc(e.says || e.account || e.rank)} · ${esc(e.ago)}</div></div>
          ${e.rank !== 'settled' ? `
            <button class="quiet small" data-done="${esc(e.id)}">done</button>
            <button class="quiet small" data-drop="${esc(e.id)}">drop</button>` : ''}
        </div>`).join('')}` : ''}`;
  said = null;

  $('#back').onclick = async () => { at.inside = false; await api('/close'); await refreshMe(); draw(); };
  $('#pub').onclick = saveAndSend;
  $('#msg').onkeydown = (e) => { if (e.key === 'Enter') saveAndSend(); };
  $('#more').onclick = () => gitHubSheet(p);
  $('#to-apps').onclick = () => go('apps');
  $('#to-terms').onclick = () => go('terminals');
  $('#to-ship').onclick = () => go('ship');

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

/**
 * Everything else GitHub can do, said in words rather than in its own
 * vocabulary, and with the ones that are not possible right now visibly not
 * possible rather than quietly failing.
 */
function gitHubSheet(p) {
  const s = p.situation ?? {};
  const has = !!s.shared;

  const options = [
    {
      id: 'save', glyph: '⌂', what: 'Save here only',
      why: 'Keep a point you can come back to, without sending it anywhere.',
      can: true,
    },
    {
      id: 'latest', glyph: '↓', what: 'Get the latest from GitHub',
      why: has
        ? 'Bring down anything your other computers have sent. Refuses if you have unsaved work.'
        : 'Nothing to get — this project has no copy on GitHub yet.',
      can: has,
    },
    {
      id: 'copy', glyph: '＋', what: 'Make a copy on GitHub',
      why: has ? 'It already has one.' : 'Puts this project on your GitHub account so it is safe and reachable.',
      can: !has,
    },
    {
      id: 'visibility', glyph: '◎',
      what: s.visibility === 'public' ? 'Make it private again' : 'Let anyone see it',
      why: has
        ? (s.visibility === 'public'
          ? 'Right now anyone with the address can read it. This puts it back to just you.'
          : 'Right now only you can see it. This makes it readable by anybody.')
        : 'It needs a copy on GitHub first.',
      can: has,
    },
    {
      id: 'undo', glyph: '↺', what: 'Take back the last save',
      why: 'Undoes the act of saving. Every file stays exactly as it is. Only works if it has not gone to GitHub.',
      can: (s.saves ?? 0) > 1 || !has,
    },
    {
      id: 'changes', glyph: '≡', what: 'See what changed',
      why: 'A plain list of every file that is different since you last saved.',
      can: true,
    },
    {
      id: 'history', glyph: '⏱', what: 'See everything you have saved',
      why: 'The trail of what you did, newest first.',
      can: true,
    },
    {
      id: 'open', glyph: '↗', what: 'Open it on GitHub',
      why: has ? 'In your browser.' : 'It needs a copy on GitHub first.',
      can: has,
    },
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
      for (const b of document.querySelectorAll('[data-do]')) {
        b.onclick = () => doGitHub(b.dataset.do, p);
      }
    },
  });
}

async function doGitHub(what, p) {
  const s = p.situation ?? {};

  if (what === 'changes' || what === 'history') {
    closeLayer();
    return statusSheet(p.dir);
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
    const open = await confirmThat({
      title: 'Make a copy on GitHub',
      what: `${p.name} will get a copy on your GitHub account.`,
      why: 'Choose whether anyone can see it. You can change this later either way.',
      confirm: 'Only I can see it',
    });
    say(await api('/github/copy', { visibility: open ? 'private' : 'public' }));
    return draw();
  }

  if (what === 'visibility') {
    closeLayer();
    const toPublic = s.visibility !== 'public';
    const sure = await confirmThat({
      title: toPublic ? 'Let anyone see it' : 'Make it private again',
      what: toPublic
        ? `Anybody who finds ${p.name} on GitHub will be able to read all of it.`
        : `${p.name} will go back to being visible only to you.`,
      why: toPublic
        ? 'Check there are no passwords or keys in the files first. Once it is out, assume somebody has a copy.'
        : 'Anyone who already took a copy still has it.',
      confirm: toPublic ? 'Yes, let anyone see it' : 'Make it private',
      danger: toPublic,
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
    <p class="sub">${p.open
      ? `Whichever you pick opens already inside <b>${esc(p.name)}</b>. You never add the folder by hand again.`
      : 'Open a project first, then any of these starts inside it.'}</p>
    ${saidHtml()}

    ${here.length ? `
      <h2>On this computer</h2>
      <div class="grid">${here.map((x) => appTile(x, p.open)).join('')}</div>` : `
      <div class="empty"><b>None of the AI apps were found here.</b>
        Install one and it appears in this list by itself.</div>`}

    ${away.length ? `
      <h2>Not on this computer</h2>
      <div class="grid">${away.map((x) => appTile(x, false)).join('')}</div>` : ''}`;
  said = null;

  for (const b of document.querySelectorAll('[data-launch]')) {
    b.onclick = async () => {
      const { launch, how } = b.dataset;
      b.disabled = true;
      say(await api('/launch', { tool: launch, how }));
      await draw();
    };
  }
  for (const b of document.querySelectorAll('[data-terminal-pick]')) {
    b.onclick = () => whichTerminal(b.dataset.terminalPick);
  }
};

function appTile(x, canLaunch) {
  const ways = x.ways ?? [];
  return `
    <div class="tile flat ${x.here ? '' : 'away'}">
      <div class="top">
        <span class="dot ${x.here ? (x.active || x.signedIn ? 'live' : 'off') : 'off'}"></span>
        <span class="title">${esc(x.name)}</span>
        ${x.made ? `<span class="chip" style="margin-left:auto">${esc(x.made)}</span>` : ''}
      </div>
      <div class="note">${x.here
        ? (x.active ? `Using the account you called “${esc(x.active)}”`
          : x.signedIn ? 'Signed in on this computer'
            : x.config ? 'Not signed in yet' : 'Signs you in inside its own window')
        : 'Not installed here.'}</div>
      ${x.here ? `
        <div class="foot">
          ${ways.includes('desktop') ? `<button class="go small" data-launch="${esc(x.id)}" data-how="desktop"
             ${canLaunch ? '' : 'disabled'}>Open in its own window</button>` : ''}
          ${ways.includes('terminal') ? `<button class="${ways.includes('desktop') ? '' : 'go '}small"
             data-launch="${esc(x.id)}" data-how="terminal" ${canLaunch ? '' : 'disabled'}>Open in a terminal</button>` : ''}
          ${ways.includes('terminal') ? `<button class="quiet small" data-terminal-pick="${esc(x.id)}"
             ${canLaunch ? '' : 'disabled'}>in which terminal…</button>` : ''}
        </div>` : ''}
    </div>`;
}

async function whichTerminal(toolId) {
  const { terminals } = await api('/terminals');
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
          say(await api('/launch', { tool: toolId, how: 'terminal', terminal: b.dataset.in }));
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

  view.innerHTML = `
    <h1>Terminals</h1>
    <p class="sub">${p.open
      ? `Each of these opens already inside <b>${esc(p.name)}</b>, so the first thing you type is the thing you meant to type.`
      : 'Open a project first, then any of these starts inside it.'}</p>
    ${saidHtml()}

    <h2>On this computer</h2>
    <div class="grid">
      ${terminals.map((t) => `
        <div class="tile flat">
          <div class="top"><span class="dot live"></span><span class="title">${esc(t.name)}</span></div>
          <div class="note">${esc(t.blurb)}</div>
          <div class="foot">
            <button class="go small" data-open-term="${esc(t.id)}" ${p.open ? '' : 'disabled'}>Open here</button>
          </div>
        </div>`).join('')}
    </div>`;
  said = null;

  for (const b of document.querySelectorAll('[data-open-term]')) {
    b.onclick = async () => {
      say(await api('/terminal', { terminal: b.dataset.openTerm }));
      draw();
    };
  }
};

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

SCREENS.accounts = async () => {
  const [g, t] = await Promise.all([api('/github'), api('/tools')]);
  const apps = t.tools.filter((x) => x.here);

  view.innerHTML = `
    <h1>Accounts</h1>
    <p class="sub">Sign in to anything from here, and keep more than one account for each
      without signing out. Nothing is ever replaced without being kept first.</p>
    ${saidHtml()}

    <h2>GitHub</h2>
    <div class="card" style="margin-bottom:.6rem">
      <div class="bar" style="margin-bottom:${g.accounts.length ? '1rem' : '0'}">
        <span class="dot ${g.active ? 'live' : 'off'}"></span>
        <b>${g.active ? `Signed in as ${esc(g.active)}` : 'Not signed in on this computer'}</b>
        <span style="flex:1"></span>
        <button class="go small" id="gh-in">${g.active ? 'Sign in to another account' : 'Sign in to GitHub'}</button>
      </div>
      ${g.accounts.map((a) => `
        <div class="row" style="margin-bottom:.35rem">
          <span class="dot ${a.active ? 'live' : 'off'}"></span>
          <div class="grow"><div class="name">${esc(a.name)}</div>
            <div class="note">${a.active ? 'in use right now' : 'signed in, not in use'}</div></div>
          ${a.active ? '' : `<button class="small" data-gh-use="${esc(a.name)}">Use this one</button>`}
          <button class="quiet small danger" data-gh-out="${esc(a.name)}">Sign out</button>
        </div>`).join('')}
    </div>

    <div class="card">
      <label class="field">Everything you save is signed with this name. It is not shown to anyone but you and your team.</label>
      <div class="bar" style="margin:0">
        <input id="id-name" placeholder="Your name" value="${esc(g.identity.name ?? '')}" style="flex:1">
        <input id="id-mail" placeholder="you@example.com" value="${esc(g.identity.email ?? '')}" style="flex:1">
        <button id="id-save">Save</button>
      </div>
    </div>

    <h2>AI apps</h2>
    ${apps.length ? apps.map(accountCard).join('') : '<div class="empty"><b>No AI apps found on this computer.</b></div>'}`;
  said = null;

  $('#gh-in').onclick = async () => { say(await api('/github/signin')); draw(); };
  $('#id-save').onclick = async () => {
    say(await api('/github/identity', { name: $('#id-name').value, email: $('#id-mail').value }));
    draw();
  };
  for (const b of document.querySelectorAll('[data-gh-use]')) {
    b.onclick = async () => { say(await api('/github/switch', { name: b.dataset.ghUse })); await refreshMe(); draw(); };
  }
  for (const b of document.querySelectorAll('[data-gh-out]')) {
    b.onclick = async () => {
      const sure = await confirmThat({
        title: 'Sign out',
        what: `${b.dataset.ghOut} will be signed out on this computer.`,
        why: 'Nothing on GitHub itself changes. You can sign back in whenever you like.',
        confirm: 'Sign out',
        danger: true,
      });
      if (!sure) return;
      say(await api('/github/signout', { name: b.dataset.ghOut }));
      await refreshMe();
      draw();
    };
  }

  for (const b of document.querySelectorAll('[data-sign]')) {
    b.onclick = async () => { say(await api('/signin/tool', { tool: b.dataset.sign })); draw(); };
  }
  for (const b of document.querySelectorAll('[data-keep]')) {
    b.onclick = async () => {
      const name = await ask({
        title: 'Keep this account',
        label: 'What should this account be called? Something you will recognise — “work”, “personal”.',
        placeholder: 'work',
        confirm: 'Keep it',
      });
      if (!name) return;
      say(await api('/profile/save', { tool: b.dataset.keep, name }));
      draw();
    };
  }
  for (const b of document.querySelectorAll('[data-use]')) {
    b.onclick = async () => { say(await api('/profile/use', { tool: b.dataset.use, name: b.dataset.name })); draw(); };
  }
  for (const b of document.querySelectorAll('[data-drop-account]')) {
    b.onclick = async () => {
      const sure = await confirmThat({
        title: 'Throw this account away',
        what: `The kept copy of “${b.dataset.name}” is deleted from this computer.`,
        why: 'You would have to sign in to that account again to get it back.',
        confirm: 'Throw it away',
        danger: true,
      });
      if (!sure) return;
      say(await api('/profile/forget', { tool: b.dataset.dropAccount, name: b.dataset.name }));
      draw();
    };
  }
};

function accountCard(x) {
  const keeps = x.profiles ?? [];
  return `
    <div class="card" style="margin-bottom:.6rem">
      <div class="bar" style="margin-bottom:${keeps.length || x.config ? '.9rem' : '0'}">
        <span class="dot ${x.active || x.signedIn ? 'live' : 'off'}"></span>
        <b>${esc(x.name)}</b>
        <span class="chip">${x.active ? `using “${esc(x.active)}”` : x.signedIn ? 'signed in' : 'not signed in'}</span>
        <span style="flex:1"></span>
        <button class="go small" data-sign="${esc(x.id)}">Sign in to ${esc(x.name)}</button>
        ${x.config ? `<button class="small" data-keep="${esc(x.id)}">Keep the one I am signed in to…</button>` : ''}
      </div>

      ${!x.config ? `<p class="note" style="margin:0;color:var(--quiet);font-size:.86rem">
          ${esc(x.name)} keeps its account inside itself, so this manager cannot hold more than one for it.
          Signing in opens the app.</p>`
      : keeps.length ? keeps.map((k) => `
          <div class="row" style="margin-bottom:.35rem">
            <span class="dot ${k.active ? 'live' : 'off'}"></span>
            <div class="grow"><div class="name">${esc(k.name)}</div>
              <div class="note">${k.active ? 'in use right now' : `last used ${ago(k.lastUsed)}`}</div></div>
            ${k.active ? '' : `<button class="small" data-use="${esc(x.id)}" data-name="${esc(k.name)}">Switch to this</button>`}
            <button class="quiet small danger" data-drop-account="${esc(x.id)}" data-name="${esc(k.name)}">Throw away</button>
          </div>`).join('')
        : `<p class="note" style="margin:0;color:var(--quiet);font-size:.86rem">
             No accounts kept yet. Sign in above, then keep it under a name — after that you can
             switch between accounts without signing out of either.</p>`}
    </div>`;
}

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

  const site = d.site;
  const app = d.app;

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
        ${site.places.some((pl) => pl.ready) ? '' : `
          <p class="note" style="color:var(--quiet);font-size:.85rem;margin-top:.6rem">
            Nowhere is ready yet. The quickest is GitHub Pages — give this project a copy
            on GitHub from the Projects tab and it turns on here.</p>`}
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
      <ul class="steps">
        ${j.steps.map((s) => `<li><span class="tick">✓</span> ${esc(s.sentence)}</li>`).join('')}
      </ul>
      <details ${j.ok === false ? 'open' : ''}>
        <summary style="cursor:pointer;color:var(--quiet);font-size:.85rem">What it printed</summary>
        <div class="log" style="margin-top:.5rem">${esc(j.lines.join('\n'))}</div>
      </details>
    </div>`;

  $('#job-close')?.addEventListener('click', () => { watching = null; draw(); });

  if (j.running) setTimeout(paintJob, 1000);
  else if (at.tab === 'ship') setTimeout(() => { if (at.tab === 'ship') draw(); }, 400);
}

// ---------------------------------------------------------------------------
// My computers
// ---------------------------------------------------------------------------

let workspaceTimer = null;

SCREENS.workspace = async () => {
  clearTimeout(workspaceTimer);
  const w = await api('/workspace');

  if (!w.joined) {
    view.innerHTML = `
      <h1>My computers</h1>
      <p class="sub">Your desktop and your laptop, working on the same things, without a
        server anywhere between them.</p>
      ${saidHtml()}
      <div class="card">
        <p style="margin-top:0">Joining makes one small private project on your own GitHub
          account called <b>viberant-workspace</b>. Every computer you sign in on puts three
          things in it: who it is, which projects it is offering, and anything you type here.
          That is all it is — there is no service of ours in the middle, and nothing about
          your work leaves your own account.</p>
        <p style="color:var(--quiet);font-size:.89rem">Your files do not travel this way. Each
          computer gets its own copy of a project from GitHub in the ordinary way. What travels
          is knowing what exists, who is about, and what was said.</p>
        <div class="bar" style="margin:1rem 0 0">
          <button class="go" id="w-join" ${me.github ? '' : 'disabled'}>Join my shared workspace</button>
          ${me.github ? '' : '<span class="note" style="color:var(--quiet)">Sign in to GitHub first, on the Accounts tab.</span>'}
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

  const others = (w.machines ?? []).filter((m) => !m.you);
  const mine = (w.machines ?? []).find((m) => m.you);
  const theirs = (w.projects ?? []).filter((p) => !p.yours);
  const ours = (w.projects ?? []).filter((p) => p.yours);

  view.innerHTML = `
    <h1>My computers</h1>
    <p class="sub">Everything here goes through <b>${esc(w.account ?? '')}</b> on GitHub.
      ${w.mismatch ? '<b style="color:var(--attention)">You are signed in as somebody else right now, so this is out of step.</b>' : ''}</p>
    ${saidHtml()}

    <h2>Computers</h2>
    <div class="grid">
      ${[mine, ...others].filter(Boolean).map((m) => `
        <div class="tile flat">
          <div class="top">
            <span class="dot ${m.hereNow ? 'live' : 'off'}"></span>
            <span class="title">${esc(m.name)}</span>
            ${m.you ? '<span class="chip vibe" style="margin-left:auto">this one</span>' : ''}
          </div>
          <div class="note">${esc(m.kind ?? '')} · ${m.hereNow ? 'here now' : `last here ${ago(m.lastHere)}`}</div>
          ${m.workingOn ? `<div class="note" style="color:var(--faint)">working on ${esc(m.workingOn)}</div>` : ''}
          ${m.you ? '<div class="foot"><button class="quiet small" id="w-rename">Rename this computer</button></div>' : ''}
        </div>`).join('')}
    </div>

    <h2>Projects your other computers are offering</h2>
    ${theirs.length ? theirs.map((p) => `
      <div class="row">
        <span class="dot ${p.url ? 'live' : 'off'}"></span>
        <div class="grow"><div class="name">${esc(p.name)}</div>
          <div class="note">from ${esc(p.fromName)} · ${esc(p.says ?? '')}${p.url ? '' : ' · no copy on GitHub, so it cannot travel'}</div></div>
        <button class="go small" data-bring='${esc(JSON.stringify(p))}' ${p.url ? '' : 'disabled'}>Bring it here</button>
      </div>`).join('')
    : '<div class="empty"><b>Nothing offered yet.</b> On your other computer, mark a project as offered and it turns up here.</div>'}

    <h2>What this computer is offering</h2>
    ${ours.length ? ours.map((p) => `
      <div class="row">
        <span class="dot live"></span>
        <div class="grow"><div class="name">${esc(p.name)}</div><div class="note">${esc(p.says ?? '')}</div></div>
        <button class="quiet small" data-stop="${esc(p.id)}">Stop offering</button>
      </div>`).join('')
    : ''}
    <div class="bar" style="margin-top:.6rem"><button id="w-offer">Choose what to offer…</button></div>

    <h2>Between your computers</h2>
    <div class="card">
      <div class="talk" id="talk">
        ${(w.said ?? []).map((s) => `
          <div class="bubble ${s.you ? 'mine' : ''}">
            <div class="who">${esc(s.fromName)} · ${ago(s.at)}</div>
            ${esc(s.text)}
          </div>`).join('') || '<p style="color:var(--quiet);margin:0">Nothing said yet.</p>'}
      </div>
      <div class="bar" style="margin:.8rem 0 0">
        <input id="w-say" placeholder="Leave a note for your other computer" style="flex:1">
        <button class="go" id="w-send">Say it</button>
      </div>
    </div>

    <div class="bar" style="margin-top:1.6rem">
      <button class="quiet small" id="w-refresh">Check again now</button>
      <button class="quiet small danger" id="w-leave">Take this computer out of the workspace</button>
    </div>`;
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
  $('#w-rename')?.addEventListener('click', async () => {
    const name = await ask({ title: 'Name this computer', label: 'What should your other computers call it?', value: me.machineName, confirm: 'Call it that' });
    if (!name) return;
    say(await api('/me/name', { name }));
    await api('/workspace/refresh');
    await refreshMe();
    draw();
  });
  $('#w-offer').onclick = offerSheet;
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

  for (const b of document.querySelectorAll('[data-bring]')) {
    b.onclick = async () => {
      const entry = JSON.parse(b.dataset.bring);
      const into = await pickFolder({ title: `Where should ${entry.name} go?`, confirm: 'Put it in here' });
      if (!into) return;
      say({ sentence: `Bringing ${entry.name} to this computer…` });
      draw();
      say(await api('/workspace/bring', { entry, into }));
      await refreshMe();
      draw();
    };
  }
  for (const b of document.querySelectorAll('[data-stop]')) {
    b.onclick = async () => { say(await api('/projects/offer', { path: b.dataset.stop, offered: false })); draw(); };
  }

  // Quietly keep in step while this page is the one you are looking at.
  workspaceTimer = setTimeout(() => { if (at.tab === 'workspace' && !layer.innerHTML) draw(); }, 20000);
};

async function offerSheet() {
  const d = await api('/projects');
  sheet({
    title: 'What should your other computers see?',
    body: `
      <p class="sub">Anything you offer here is listed on your other computers, with the
        name of this one beside it. A project with no copy on GitHub can be seen but not
        brought across.</p>
      ${d.projects.map((p) => `
        <div class="row">
          <span class="dot ${p.offered ? 'live' : 'off'}"></span>
          <div class="grow"><div class="name">${esc(p.name)}</div>
            <div class="note">${esc(p.says)}${p.shared ? '' : ' · only on this computer'}</div></div>
          <button class="small" data-offer="${esc(p.path)}" data-now="${p.offered ? '1' : '0'}">
            ${p.offered ? 'Keep it to this computer' : 'Offer it'}</button>
        </div>`).join('')}`,
    onOpen: (body) => {
      for (const b of body.querySelectorAll('[data-offer]')) {
        b.onclick = async () => {
          await api('/projects/offer', { path: b.dataset.offer, offered: b.dataset.now !== '1' });
          closeLayer();
          await api('/workspace/refresh');
          offerSheet();
          draw();
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Noticing the folder changed underneath us
// ---------------------------------------------------------------------------

let lastPulse = null;

async function checkPulse() {
  if (document.hidden || layer.innerHTML) return;
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
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'Escape') { if (layer.innerHTML) closeLayer(); else if (at.inside) { at.inside = false; api('/close').then(refreshMe).then(draw); } return; }
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

  // The opening runs once and then gets out of the way for good.
  const hold = matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 1750;
  setTimeout(() => {
    $('#opening').classList.add('going');
    $('#frame').classList.add('up');
    setTimeout(() => $('#opening').remove(), 500);
  }, hold);
};

start();
