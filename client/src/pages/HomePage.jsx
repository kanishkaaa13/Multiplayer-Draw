import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.jsx";
import { apiPath, getServerUrl } from "../lib/serverUrl.js";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export default function HomePage({ profile, setProfile }) {
  const nav = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const inviteBase = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return origin;
  }, []);

  const persistProfile = (next) => {
    setProfile(next);
    localStorage.setItem("draw-profile", JSON.stringify(next));
  };

  const createRoom = async () => {
    setErr("");
    setBusy(true);
    try {
      const base = getServerUrl();
      const url =
        base === window.location.origin
          ? apiPath("/rooms")
          : `${base}/api/rooms`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${profile.username}'s room` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      nav(`/room/${data.code}`);
    } catch (e) {
      setErr(e.message || "Could not create room");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setErr("Enter a valid room code");
      return;
    }
    nav(`/room/${code}`);
  };

  return (
    <div className="relative min-h-full overflow-hidden bg-slate-50 dark:bg-ink-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,.20),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(14,165,233,.12),_transparent_50%)]" />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 md:flex-row md:py-16">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-medium text-ink-800 shadow-sm dark:border-white/10 dark:bg-ink-900/70 dark:text-slate-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Real-time • Socket.IO • MongoDB
          </div>
          <h1 className="font-display text-4xl font-bold leading-tight text-ink-950 dark:text-white md:text-5xl">
            CanvasTogether
          </h1>
          <p className="max-w-xl text-lg text-slate-600 dark:text-slate-300">
            Professional multiplayer whiteboard: shared strokes, live cursors, MS
            Paint-style tools, chat, and an optional sketch-guess mode.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-2xl border border-black/10 bg-white/80 px-4 py-2 text-sm font-semibold text-ink-900 shadow-sm hover:bg-white dark:border-white/10 dark:bg-ink-900/80 dark:text-white dark:hover:bg-ink-800"
            >
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
            <span className="self-center text-xs text-slate-500">
              Tip: invite link looks like{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                {inviteBase}/room/ABCDEF
              </code>
            </span>
          </div>
        </div>

        <div className="w-full max-w-md space-y-4">
          <div className="glass rounded-3xl p-6 shadow-glow">
            <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-white">
              Your profile
            </h2>
            <label className="mt-4 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Display name
            </label>
            <input
              value={profile.username}
              onChange={(e) =>
                persistProfile({ ...profile, username: e.target.value })
              }
              className="mt-1 w-full rounded-xl border border-black/10 bg-white/90 px-3 py-2 text-sm text-ink-900 outline-none ring-accent/30 focus:ring-2 dark:border-white/10 dark:bg-ink-900/90 dark:text-white"
              maxLength={32}
            />
            <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-400">
              Cursor color
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  className={`h-9 w-9 rounded-full border-2 ${
                    profile.color === c
                      ? "border-white ring-2 ring-accent"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => persistProfile({ ...profile, color: c })}
                />
              ))}
            </div>
          </div>

          <div className="glass rounded-3xl p-6">
            <button
              type="button"
              disabled={busy}
              onClick={createRoom}
              className="flex w-full items-center justify-center rounded-2xl bg-accent py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-accent-dim disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create room"}
            </button>
            {err && (
              <p className="mt-2 text-center text-xs text-red-600 dark:text-red-400">
                {err}
              </p>
            )}
            <form onSubmit={joinRoom} className="mt-4 space-y-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Join with code
              </label>
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase())
                  }
                  placeholder="e.g. X7K2M9"
                  className="flex-1 rounded-xl border border-black/10 bg-white/90 px-3 py-2 text-sm font-mono tracking-widest text-ink-900 outline-none ring-accent/30 focus:ring-2 dark:border-white/10 dark:bg-ink-900/90 dark:text-white"
                />
                <button
                  type="submit"
                  className="rounded-2xl border border-black/10 bg-white/90 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-white dark:border-white/10 dark:bg-ink-900/90 dark:text-white dark:hover:bg-ink-800"
                >
                  Join
                </button>
              </div>
            </form>
            <p className="mt-4 text-center text-xs text-slate-500">
              Already have a link?{" "}
              <Link
                className="font-semibold text-accent hover:underline"
                to="/"
              >
                Share this app
              </Link>{" "}
              and open <code>/room/CODE</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
