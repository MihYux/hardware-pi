export async function clearWebsiteCacheAndReload() {
  const cleanupTasks: Promise<unknown>[] = [];

  if ("serviceWorker" in navigator) {
    cleanupTasks.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        ),
    );
  }

  if ("caches" in window) {
    cleanupTasks.push(
      window.caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key)))),
    );
  }

  await Promise.allSettled(cleanupTasks);
  try {
    window.localStorage.clear();
  } catch {
    // Some privacy modes expose Storage but reject access. Reload anyway.
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // Session storage may be disabled independently from Cache Storage.
  }

  const next = new URL(window.location.href);
  next.search = `cache-reset=${Date.now()}`;
  next.hash = "";
  window.location.replace(next);
}
