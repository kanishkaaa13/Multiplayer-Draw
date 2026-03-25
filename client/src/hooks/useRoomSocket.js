import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getServerUrl } from "../lib/serverUrl.js";

export function useRoomSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState(null);

  const socket = useMemo(() => {
    const url = getServerUrl();
    const s = io(url, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    socketRef.current = s;
    return s;
  }, []);

  useEffect(() => {
    const s = socket;
    const onConnect = () => {
      setLastError(null);
      setConnected(true);
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => {
      setLastError(err?.message || "Connection failed");
      setConnected(false);
    };
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    /** Required after React StrictMode runs cleanup (disconnect); autoConnect only fires once. */
    if (!s.connected) {
      s.connect();
    } else {
      setConnected(true);
    }
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.disconnect();
    };
  }, [socket]);

  return { socket, connected, lastError, serverUrl: getServerUrl() };
}
