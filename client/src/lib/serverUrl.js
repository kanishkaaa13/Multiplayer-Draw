/**
 * Socket.IO + REST base URL.
 * In Vite dev, the app runs on :5173 but the API/socket server is on :4000 — do not use
 * window.location.origin for sockets unless you proxy /socket.io (we don't by default).
 */
export function getServerUrl() {
  const fromEnv = import.meta.env.VITE_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:4000`;
    }
    return window.location.origin;
  }
  return "http://localhost:4000";
}

export function apiPath(p) {
  const base = getServerUrl();
  if (base === "" || base === window?.location?.origin) {
    return `/api${p.startsWith("/") ? p : `/${p}`}`;
  }
  return `${base}/api${p.startsWith("/") ? p : `/${p}`}`;
}
