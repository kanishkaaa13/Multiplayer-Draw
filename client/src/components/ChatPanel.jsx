import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";

export default function ChatPanel({
  socket,
  roomCode,
  userId,
  username,
  initialMessages = [],
  guessMode,
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [roomCode, initialMessages]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (m) => {
      setMessages((prev) => [...prev.slice(-200), m]);
    };
    const onJoin = (p) => {
      setMessages((prev) => [
        ...prev,
        {
          id: nanoid(),
          kind: "system",
          username: "Room",
          userId: "system",
          text: `${p.username} joined`,
          createdAt: new Date().toISOString(),
        },
      ]);
    };
    const onLeft = (p) => {
      setMessages((prev) => [
        ...prev,
        {
          id: nanoid(),
          kind: "system",
          username: "Room",
          userId: "system",
          text: `${p.username} left`,
          createdAt: new Date().toISOString(),
        },
      ]);
    };
    socket.on("chat:message", onMsg);
    socket.on("room:user-joined", onJoin);
    socket.on("room:user-left", onLeft);
    return () => {
      socket.off("chat:message", onMsg);
      socket.off("room:user-joined", onJoin);
      socket.off("room:user-left", onLeft);
    };
  }, [socket]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (kind = "chat") => {
    const t = text.trim();
    if (!t || !socket) return;
    socket.emit("chat:send", { roomCode, text: t, kind }, () => {});
    setText("");
  };

  return (
    <div className="glass flex h-full min-h-[280px] flex-col rounded-2xl border border-black/10 dark:border-white/10">
      <div className="border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">
          Room chat
        </h3>
        {guessMode && (
          <p className="mt-0.5 text-[11px] text-violet-600 dark:text-violet-300">
            Guess mode: messages are checked against the secret word.
          </p>
        )}
      </div>
      <div className="max-h-[340px] flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id || `${m.createdAt}-${m.text?.slice(0, 8)}`}
            className={`rounded-xl px-3 py-2 ${
              m.kind === "system"
                ? "bg-amber-100/80 text-amber-950 dark:bg-amber-900/30 dark:text-amber-100"
                : "bg-black/[0.04] dark:bg-white/5"
            }`}
          >
            <div className="flex items-baseline gap-2 text-xs">
              <span
                className="font-semibold"
                style={{
                  color:
                    m.userId === userId
                      ? undefined
                      : "var(--tw-prose-bold, inherit)",
                }}
              >
                {m.username}
              </span>
              <span className="text-[10px] text-slate-500">
                {m.createdAt
                  ? new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : ""}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-ink-800 dark:text-slate-100">
              {m.text}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-black/10 p-3 dark:border-white/10">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm text-ink-900 outline-none ring-accent/30 placeholder:text-slate-400 focus:ring-2 dark:border-white/10 dark:bg-ink-900/80 dark:text-white"
            placeholder={guessMode ? "Type a guess…" : "Message the room…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(guessMode ? "guess" : "chat");
            }}
          />
          <button
            type="button"
            onClick={() => send(guessMode ? "guess" : "chat")}
            className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-glow hover:bg-accent-dim"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
