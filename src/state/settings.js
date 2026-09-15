// Landing-page choices, remembered per browser.
const KEY = 'phraselette.settings.v2'; // v2: bidirectional Probabilities default (DistilBERT); older saved choices are ignored

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch { /* private mode etc. */ }
}
