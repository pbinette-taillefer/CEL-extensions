// Firefox exposes the Promise API as browser; the other targets expose chrome.
export const api = globalThis.browser ?? globalThis.chrome;
export const optionalUserScripts =
  api.runtime.getManifest().optional_permissions?.includes("userScripts") ?? false;

export function enableUserScripts() {
  if (optionalUserScripts) {
    // Request inside the original click gesture, before asynchronous work.
    return api.permissions.request({ permissions: ["userScripts"] });
  }
  const scheme = /Edg\//.test(navigator.userAgent) ? "edge" : "chrome";
  return api.tabs.create({ url: `${scheme}://extensions/?id=${api.runtime.id}` });
}
