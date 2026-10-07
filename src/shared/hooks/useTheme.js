import { useSyncExternalStore } from 'react';

/**
 * Appearance: 'light' | 'dark' | 'system' (default). The resolved value is written to
 * <html data-theme="light|dark"> – index.html does this before first paint to avoid a flash.
 */
const KEY = 'dolphin-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set();

const readPreference = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

let preference = readPreference();

const resolve = (pref) => (pref === 'system' ? (media?.matches ? 'dark' : 'light') : pref);

const apply = () => {
  const resolved = resolve(preference);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? (root.dataset.appearanceQuality === 'auto' ? '#121212' : '#0d0916') : '#f5f5f7');
};

const emit = () => listeners.forEach((l) => l());

export function setThemePreference(next) {
  preference = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch { /* storage unavailable – keep in memory */ }
  apply();
  emit();
}

if (media) {
  apply();
  media.addEventListener('change', () => {
    if (preference === 'system') { apply(); emit(); }
  });
}

const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const getSnapshot = () => `${preference}|${resolve(preference)}`;

export default function useTheme() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => 'system|light');
  const [pref, resolved] = snap.split('|');
  return { preference: pref, resolved, setPreference: setThemePreference };
}
