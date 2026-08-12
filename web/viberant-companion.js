const AGENT = 'http://127.0.0.1:7777';
const PROJECT = 'e6698b30425fd9b89ce7040fa39bafb1';
const KEY = 'viberant:companion:' + PROJECT;
const bytes = (size = 32) => { const value = new Uint8Array(size); crypto.getRandomValues(value); return btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const digest = async (value) => { const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return btoa(String.fromCharCode(...new Uint8Array(data))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

async function connect() {
  const verifier = bytes(48); const state = bytes(24); const challenge = await digest(verifier);
  sessionStorage.setItem(KEY + ':verifier', verifier); sessionStorage.setItem(KEY + ':state', state);
  const back = location.origin + location.pathname;
  const url = new URL(AGENT + '/web-companion/pair');
  url.search = new URLSearchParams({ project: PROJECT, origin: location.origin, return: back, challenge, state });
  const opened = window.open(url, 'viberant-companion', 'popup,width=620,height=680');
  if (!opened) location.href = url;
  return new Promise((resolve) => {
    const heard = (event) => { if (event.origin === location.origin && event.data?.type === 'viberant-companion') { window.removeEventListener('message', heard); resolve(event.data); } };
    window.addEventListener('message', heard);
  });
}

async function completePairing() {
  const at = new URL(location.href); const code = at.searchParams.get('viberant_code');
  if (!code) return null;
  const state = at.searchParams.get('viberant_state');
  if (state !== sessionStorage.getItem(KEY + ':state')) return null;
  const response = await fetch(AGENT + '/web-companion/token', { method: 'POST', mode: 'cors', targetAddressSpace: 'local', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, verifier: sessionStorage.getItem(KEY + ':verifier') }) });
  const result = await response.json();
  if (result.ok) localStorage.setItem(KEY, result.token);
  at.searchParams.delete('viberant_code'); at.searchParams.delete('viberant_state'); history.replaceState({}, '', at);
  window.opener?.postMessage({ type: 'viberant-companion', ...result }, location.origin);
  if (window.opener && result.ok) window.close();
  return result;
}

async function call(method, values = {}) {
  const token = localStorage.getItem(KEY);
  if (!token) return { ok: false, sentence: 'This web version is not connected to Viberant.', action: 'Connect the desktop companion first.' };
  try {
    const response = await fetch(AGENT + '/web-companion/call', { method: 'POST', mode: 'cors', targetAddressSpace: 'local', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ method, ...values }) });
    const result = await response.json(); if (!result.ok && /not connected/i.test(result.sentence || '')) localStorage.removeItem(KEY); return result;
  } catch { return { ok: false, sentence: 'The desktop companion could not be reached.', action: 'Open Viberant on the desktop computer and try again.' }; }
}

window.ViberantCompanion = { connect, call, connected: () => !!localStorage.getItem(KEY) };
completePairing();
