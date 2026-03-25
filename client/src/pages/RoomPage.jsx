import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.jsx";
import CanvasBoard from "../components/CanvasBoard.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import VoiceChatPanel from "../components/VoiceChatPanel.jsx";
import { useRoomSocket } from "../hooks/useRoomSocket.js";

export default function RoomPage({ profile }) {
  const { code } = useParams();
  const nav = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { socket, connected, lastError, serverUrl } = useRoomSocket();

  const [status, setStatus] = useState("joining");
  const [error, setError] = useState("");
  const [userId, setUserId] = useState(null);
  const [drawOps, setDrawOps] = useState([]);
  const [chat, setChat] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [game, setGame] = useState(null);
  const [secretWord, setSecretWord] = useState(null);
  const [roundEnd, setRoundEnd] = useState(null);
  const [totalEnd, setTotalEnd] = useState(null);
  const [tick, setTick] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");

  const roomCode = (code || "").toUpperCase();

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/room/${roomCode}`;
  }, [roomCode]);

  useEffect(() => {
    if (!socket || !connected || !roomCode || !profile?.username) return;

    let cancelled = false;
    setStatus("joining");
    setError("");

    socket.emit(
      "room:join",
      {
        roomCode,
        username: profile.username,
        color: profile.color,
        userId: localStorage.getItem("draw-user-id") || undefined,
      },
      (res) => {
        if (cancelled) return;
        if (!res?.ok) {
          setError(res?.error || "Could not join");
          setStatus("error");
          return;
        }
        localStorage.setItem("draw-user-id", res.userId);
        setUserId(res.userId);
        setDrawOps(res.drawOps || []);
        setChat(res.chat || []);
        setParticipants(res.participants || []);
        setGame(res.game || null);
        setRoundEnd(res.game?.roundEndsAt || null);
        setTotalEnd(res.game?.totalEndsAt || null);
        setStatus("in-room");
      }
    );

    const onPeers = ({ participants: p }) => setParticipants(p || []);
    const onJoined = () => {};
    const onLeft = () => {};
    const onRound = (payload) => {
      setGame((g) => ({
        ...(g || {}),
        active: true,
        drawerUserId: payload.drawerUserId,
        drawerName: payload.drawerName,
        hint: payload.hint,
        scores: payload.scores || {},
        totalEndsAt: payload.totalEndsAt,
      }));
      setRoundEnd(payload.roundEndsAt);
      setTotalEnd(payload.totalEndsAt || null);
      setSecretWord(null);
    };
    const onSecret = ({ word }) => setSecretWord(word);
    const onWon = (payload) => {
      setGame((g) => ({
        ...(g || {}),
        scores: payload.scores || g?.scores,
      }));
    };
    const onEnded = (payload) => {
      setGame((g) => ({
        active: false,
        scores: payload.scores || g?.scores,
      }));
      setRoundEnd(null);
      setTotalEnd(null);
      setSecretWord(null);
    };

    socket.on("room:peers", onPeers);
    socket.on("room:user-joined", onJoined);
    socket.on("room:user-left", onLeft);
    socket.on("game:started", onRound);
    socket.on("game:round-started", onRound);
    socket.on("game:secret-word", onSecret);
    socket.on("game:round-won", onWon);
    socket.on("game:ended", onEnded);

    return () => {
      cancelled = true;
      socket.off("room:peers", onPeers);
      socket.off("room:user-joined", onJoined);
      socket.off("room:user-left", onLeft);
      socket.off("game:started", onRound);
      socket.off("game:round-started", onRound);
      socket.off("game:secret-word", onSecret);
      socket.off("game:round-won", onWon);
      socket.off("game:ended", onEnded);
    };
  }, [socket, connected, roomCode, profile?.username, profile?.color]);

  useEffect(() => {
    if (!roundEnd) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [roundEnd]);

  const secondsLeft = useMemo(() => {
    if (!roundEnd || !game?.active) return null;
    return Math.max(
      0,
      Math.ceil((new Date(roundEnd).getTime() - Date.now()) / 1000)
    );
  }, [roundEnd, game?.active, tick]);
  const totalSecondsLeft = useMemo(() => {
    if (!totalEnd || !game?.active) return null;
    return Math.max(0, Math.ceil((new Date(totalEnd).getTime() - Date.now()) / 1000));
  }, [totalEnd, game?.active, tick]);

  const startGameRound = () => {
    socket?.emit("game:start-round", { roomCode });
  };
  const drawerName = useMemo(() => {
    if (!game?.drawerUserId) return "";
    return (
      participants.find((p) => p.userId === game.drawerUserId)?.username ||
      game.drawerName ||
      "Unknown"
    );
  }, [participants, game?.drawerUserId, game?.drawerName]);

  const copyInvite = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const input = document.createElement("input");
        input.value = inviteUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(""), 1400);
    } catch {
      setCopyStatus("Copy failed");
      window.setTimeout(() => setCopyStatus(""), 1800);
    }
  };


  const endGame = () => {
    socket?.emit("game:end", { roomCode });
  };

  if (!profile?.username) {
    return (
      <div className="p-8 text-center text-slate-600 dark:text-slate-300">
        Set a username on the{" "}
        <Link className="text-accent underline" to="/">
          home page
        </Link>{" "}
        first.
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-ink-950">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-ink-900/80">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="font-display text-sm font-semibold text-accent hover:underline"
          >
            ← Home
          </Link>
          <div className="h-5 w-px bg-black/10 dark:bg-white/10" />
          <div className="flex flex-col">
            <span className="text-xs text-slate-500">Room</span>
            <span className="font-mono text-lg font-bold tracking-widest text-ink-900 dark:text-white">
              {roomCode}
            </span>
          </div>
          <button
            type="button"
            onClick={copyInvite}
            className="ml-2 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink-900 dark:border-white/10 dark:bg-ink-800 dark:text-white"
          >
            {copyStatus || "Copy invite link"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-xl border border-black/10 px-3 py-1.5 text-xs font-semibold dark:border-white/10"
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span
              className={`max-w-[220px] truncate text-xs font-medium ${
                connected ? "text-emerald-600" : "text-amber-600"
              }`}
              title={lastError || (connected ? "" : `Socket → ${serverUrl}`)}
            >
              {connected
                ? game?.active
                  ? `Drawing: ${drawerName || "..." }`
                  : "No active round"
                : lastError || "Connecting…"}
            </span>
            {participants.length > 0 && (
              <div className="flex -space-x-2">
                {participants.slice(0, 8).map((p) => (
                  <span
                    key={p.userId}
                    title={p.username}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white dark:border-ink-900"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.username.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {game?.active && (
          <div className="flex flex-wrap items-center gap-3 border-t border-black/5 bg-violet-50/90 px-4 py-2 dark:border-white/5 dark:bg-violet-950/40">
            <span className="text-xs font-semibold text-violet-900 dark:text-violet-100">
              Sketch & Guess — Hint: <strong>{game.hint}</strong>
            </span>
            {secretWord && (
              <span className="rounded-lg bg-violet-600 px-2 py-0.5 text-xs text-white">
                Word: {secretWord}
              </span>
            )}
            {secondsLeft != null && (
              <span className="rounded-lg bg-violet-500/20 px-2 py-0.5 font-mono text-xs font-bold text-violet-900 dark:text-violet-100">
                {secondsLeft}s
              </span>
            )}
            {totalSecondsLeft != null && (
              <span className="rounded-lg bg-indigo-500/20 px-2 py-0.5 font-mono text-xs font-bold text-indigo-900 dark:text-indigo-100">
                game {Math.floor(totalSecondsLeft / 60)}:
                {String(totalSecondsLeft % 60).padStart(2, "0")}
              </span>
            )}
            {roundEnd && (
              <span className="text-xs text-violet-800 dark:text-violet-200">
                Ends {new Date(roundEnd).toLocaleTimeString()}
              </span>
            )}
            {game.drawerUserId === userId && (
              <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
                You are drawing
              </span>
            )}
            {userId && (
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Your score: {game.scores?.[userId] ?? 0}
              </span>
            )}
          </div>
        )}
      </header>

      {status === "error" && (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => nav("/")}
            className="mt-4 text-accent underline"
          >
            Back home
          </button>
        </div>
      )}

      {status === "in-room" && userId && (
        <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Signed in as{" "}
                <strong style={{ color: profile.color }}>{profile.username}</strong>
              </span>
              <span className="text-xs text-slate-400">|</span>
              <button
                type="button"
                onClick={startGameRound}
                className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
              >
                Start 20m game
              </button>
              <button
                type="button"
                onClick={endGame}
                className="rounded-xl border border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-800 dark:border-violet-700 dark:text-violet-200"
              >
                End game
              </button>
            </div>
            <CanvasBoard
              socket={socket}
              roomCode={roomCode}
              userId={userId}
              username={profile.username}
              cursorColor={profile.color}
              game={game}
              initialDrawOps={drawOps}
            />
          </div>
          <aside className="min-h-0 lg:sticky lg:top-20 lg:self-start">
            <div className="mb-3">
              <VoiceChatPanel
                socket={socket}
                roomCode={roomCode}
                userId={userId}
                participants={participants}
              />
            </div>
            <ChatPanel
              socket={socket}
              roomCode={roomCode}
              userId={userId}
              username={profile.username}
              initialMessages={chat}
              guessMode={Boolean(game?.active && game?.drawerUserId !== userId)}
            />
          </aside>
        </main>
      )}

      {status === "joining" && (
        <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-slate-600 dark:text-slate-400">
          <Link
            to="/"
            className="text-sm font-semibold text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            ← Home: create a new room or enter a code
          </Link>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The create-room screen is only at{" "}
            <code className="rounded bg-black/5 px-1 dark:bg-white/10">/</code> —
            this URL is for joining room <strong>{roomCode}</strong>.
          </p>
          <p className="text-lg font-medium text-ink-900 dark:text-white">
            Joining room…
          </p>
          {!connected && (
            <>
              <p className="text-sm">
                Waiting for the real-time server at{" "}
                <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                  {serverUrl}
                </code>
                .
              </p>
              {lastError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {lastError}
                </p>
              )}
              <div className="rounded-2xl border border-black/10 bg-white/80 p-4 text-left text-xs dark:border-white/10 dark:bg-ink-900/80">
                <p className="font-semibold text-ink-900 dark:text-white">
                  If this hangs:
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-600 dark:text-slate-300">
                  <li>
                    In a terminal, start the API:{" "}
                    <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                      cd server ; npm run dev
                    </code>
                  </li>
                  <li>
                    Ensure MongoDB is running and{" "}
                    <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                      MONGODB_URI
                    </code>{" "}
                    in{" "}
                    <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                      server/.env
                    </code>{" "}
                    is correct.
                  </li>
                  <li>
                    This room must exist — create one from Home, or use a code
                    someone shared.
                  </li>
                </ol>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
