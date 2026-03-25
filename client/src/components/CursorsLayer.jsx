const TTL_MS = 12_000;

export default function CursorsLayer({ remotes, width, height }) {
  const now = Date.now();
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
      style={{ width, height }}
    >
      {Object.values(remotes).map((c) => {
        if (!c?.x && c?.x !== 0) return null;
        if (now - c.t > TTL_MS) return null;
        const left = `${c.x * 100}%`;
        const top = `${c.y * 100}%`;
        return (
          <div
            key={c.userId}
            className="absolute -translate-x-1 -translate-y-1 transition-transform duration-75"
            style={{ left, top }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" className="drop-shadow">
              <path
                d="M3 3l7.5 18L9 13l6-1L3 3z"
                fill={c.color}
                stroke="rgba(0,0,0,.35)"
                strokeWidth="1"
              />
            </svg>
            <span
              className="ml-2 inline-block max-w-[140px] truncate rounded-md px-2 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ backgroundColor: c.color }}
            >
              {c.username}
            </span>
          </div>
        );
      })}
    </div>
  );
}
