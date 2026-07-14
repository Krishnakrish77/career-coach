// Thin wrappers around chrome.storage.local, shared by popup.js and dashboard.js
// so both surfaces read/write the same shape without duplicating logic. Jobs,
// resume data, preferences, and generation metadata live in Supabase.
export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}
export async function setStorage(obj) {
  return chrome.storage.local.set(obj);
}
