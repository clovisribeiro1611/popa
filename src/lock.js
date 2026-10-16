// Bloqueio opcional da app: PIN próprio (hash PBKDF2) e, se disponível, biometria do dispositivo.
// É um ecrã de privacidade; os dados já estão na pasta privada da app e não são cifrados.

import { platform } from './platform/index.js';
import { store } from './store.js';
import { $, $$, icon } from './ui.js';

const GRACE_MS = 30_000;       // tempo em segundo plano antes de voltar a bloquear
const MAX_TRIES = 5;
const LOCKOUT_MS = 30_000;

let locked = false;
let backgroundAt = null;

export const isLocked = () => locked;
export const markBackground = () => { backgroundAt = Date.now(); };

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPin(pin, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150_000 }, key, 256);
  return { pinHash: b64(bits), pinSalt: b64(salt) };
}

async function verifyPin(pin) {
  const { pinHash, pinSalt } = store.get().settings.bloqueio;
  return (await hashPin(pin, unb64(pinSalt))).pinHash === pinHash;
}

/** Biometria só existe no APK; na web o desbloqueio é só por PIN. */
export async function biometryAvailable() {
  return platform.caps.biometria && platform.biometry.available();
}

const biometricUnlock = () => platform.biometry.authenticate('Desbloquear a POPA');

/** Mostra o ecrã de bloqueio se estiver ativo (no arranque, ou ao retomar após GRACE_MS). */
export async function lockIfEnabled({ onResume = false } = {}) {
  const b = store.get().settings.bloqueio;
  if (!b.ativo || !b.pinHash || locked) return;
  if (onResume && (backgroundAt == null || Date.now() - backgroundAt < GRACE_MS)) return;
  backgroundAt = null;
  await showLockScreen();
}

function showLockScreen() {
  locked = true;
  const b = store.get().settings.bloqueio;
  const len = b.pinLen || 4;
  const el = document.createElement('div');
  el.className = 'lock';
  el.innerHTML = `
    <div class="lock-logo">${icon('lock')}</div>
    <h1>POPA</h1>
    <p class="muted" id="l-msg">Introduza o PIN</p>
    <div class="pin-dots">${'<i></i>'.repeat(len)}</div>
    <div class="keypad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
      <button class="ghost" data-bio aria-label="Biometria" style="visibility:hidden">${icon('finger')}</button>
      <button data-k="0">0</button>
      <button class="ghost" data-del aria-label="Apagar">${icon('backspace')}</button>
    </div>`;
  document.body.appendChild(el);
  document.activeElement?.blur?.();

  return new Promise((resolve) => {
    let pin = '', tries = 0, blockedUntil = 0, checking = false;
    const dots = $('.pin-dots', el);
    const paint = () => $$('i', dots).forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const unlock = () => {
      locked = false;
      el.remove();
      resolve();
    };
    const tryBio = async () => { if (await biometricUnlock()) unlock(); };

    el.addEventListener('click', async (e) => {
      const k = e.target.closest('button');
      if (!k || checking) return;
      if ('bio' in k.dataset) return tryBio();
      if (Date.now() < blockedUntil) return;
      if ('del' in k.dataset) pin = pin.slice(0, -1);
      else if (pin.length < len) pin += k.dataset.k;
      paint();
      if (pin.length < len) return;
      checking = true;
      const ok = await verifyPin(pin);
      checking = false;
      if (ok) return unlock();
      tries++;
      pin = '';
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      paint();
      if (tries >= MAX_TRIES) {
        tries = 0;
        blockedUntil = Date.now() + LOCKOUT_MS;
        $('#l-msg', el).textContent = 'Demasiadas tentativas. Aguarde 30 segundos.';
        setTimeout(() => ($('#l-msg', el).textContent = 'Introduza o PIN'), LOCKOUT_MS);
      } else $('#l-msg', el).textContent = `PIN incorreto (${MAX_TRIES - tries} tentativas restantes)`;
    });

    if (b.biometria) biometryAvailable().then((ok) => {
      if (!ok) return;
      $('[data-bio]', el).style.visibility = 'visible';
      tryBio();
    });
  });
}
