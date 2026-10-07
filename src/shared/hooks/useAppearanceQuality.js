import { useSyncExternalStore } from 'react';

const KEY = 'dolphin-appearance-quality';
const listeners = new Set();
const read = () => {
  try { const value = localStorage.getItem(KEY); return ['auto', 'hd', 'ultra'].includes(value) ? value : 'hd'; }
  catch { return 'hd'; }
};
let quality = read();
const apply = () => {
  document.documentElement.dataset.appearanceQuality = quality;
  const dark = document.documentElement.dataset.theme === 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? (quality === 'auto' ? '#121212' : '#0d0916') : '#f5f5f7');
};
export function setAppearanceQuality(value) {
  if (!['auto', 'hd', 'ultra'].includes(value)) return;
  quality = value;
  try { localStorage.setItem(KEY, value); } catch { /* Keep the preference in memory. */ }
  apply(); listeners.forEach(listener => listener());
}
if (typeof document !== 'undefined') apply();
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export default function useAppearanceQuality() {
  return { quality: useSyncExternalStore(subscribe, () => quality, () => 'hd'), setQuality: setAppearanceQuality };
}
