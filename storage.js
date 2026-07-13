// Thin wrappers around chrome.storage.local, shared by popup.js and dashboard.js
// so both surfaces read/write the same shape without duplicating logic.
export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}
export async function setStorage(obj) {
  return chrome.storage.local.set(obj);
}
export async function getJobs() {
  const { jobs } = await getStorage('jobs');
  return jobs || [];
}
export async function saveJobs(jobs) {
  await setStorage({ jobs });
}
