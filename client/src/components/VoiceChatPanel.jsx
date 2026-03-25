import { useEffect, useMemo, useRef, useState } from "react";

const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VoiceChatPanel({ socket, roomCode, userId, participants }) {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [remoteMap, setRemoteMap] = useState({});
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());

  const participantName = useMemo(() => {
    const map = {};
    for (const p of participants || []) map[p.userId] = p.username;
    return map;
  }, [participants]);

  const closePeer = (peerId) => {
    const pc = peersRef.current.get(peerId);
    if (pc) pc.close();
    peersRef.current.delete(peerId);
    setRemoteMap((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  };

  const createPeer = (peerId) => {
    if (!localStreamRef.current) return null;
    if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(peerId, pc);
    for (const track of localStreamRef.current.getTracks()) {
      pc.addTrack(track, localStreamRef.current);
    }
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      socket?.emit("voice:ice", {
        roomCode,
        targetUserId: peerId,
        candidate: e.candidate,
      });
    };
    pc.ontrack = (e) => {
      setRemoteMap((prev) => ({
        ...prev,
        [peerId]: e.streams[0],
      }));
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        closePeer(peerId);
      }
    };
    return pc;
  };

  const makeOffer = async (peerId) => {
    const pc = createPeer(peerId);
    if (!pc) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket?.emit("voice:offer", {
      roomCode,
      targetUserId: peerId,
      sdp: offer,
    });
  };

  useEffect(() => {
    if (!socket || !enabled || !userId) return;

    const onJoined = ({ userId: peerId }) => {
      if (!peerId || peerId === userId) return;
      if (userId < peerId) void makeOffer(peerId);
    };
    const onLeft = ({ userId: peerId }) => {
      if (!peerId) return;
      closePeer(peerId);
    };
    const onOffer = async ({ fromUserId, sdp }) => {
      if (!fromUserId || !sdp) return;
      const pc = createPeer(fromUserId);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("voice:answer", {
        roomCode,
        targetUserId: fromUserId,
        sdp: answer,
      });
    };
    const onAnswer = async ({ fromUserId, sdp }) => {
      const pc = peersRef.current.get(fromUserId);
      if (!pc || !sdp) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    };
    const onIce = async ({ fromUserId, candidate }) => {
      const pc = peersRef.current.get(fromUserId);
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore out-of-order ICE */
      }
    };

    socket.on("voice:user-joined", onJoined);
    socket.on("voice:user-left", onLeft);
    socket.on("voice:offer", onOffer);
    socket.on("voice:answer", onAnswer);
    socket.on("voice:ice", onIce);
    return () => {
      socket.off("voice:user-joined", onJoined);
      socket.off("voice:user-left", onLeft);
      socket.off("voice:offer", onOffer);
      socket.off("voice:answer", onAnswer);
      socket.off("voice:ice", onIce);
    };
  }, [socket, enabled, roomCode, userId]);

  useEffect(() => {
    if (!enabled || !socket) return;
    socket.emit("voice:join", { roomCode });
    return () => {
      socket.emit("voice:leave", { roomCode });
    };
  }, [enabled, socket, roomCode]);

  const toggleVoice = async () => {
    if (enabled) {
      setEnabled(false);
      for (const track of localStreamRef.current?.getTracks() || []) track.stop();
      localStreamRef.current = null;
      for (const peerId of [...peersRef.current.keys()]) closePeer(peerId);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setEnabled(true);
      setMuted(false);
    } catch {
      alert("Microphone permission denied or unavailable.");
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    for (const track of localStreamRef.current?.getAudioTracks() || []) {
      track.enabled = !next;
    }
  };

  return (
    <div className="glass rounded-2xl border border-black/10 p-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">
          Voice chat
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {enabled ? "Connected" : "Off"}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleVoice}
          className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          {enabled ? "Leave voice" : "Join voice"}
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={toggleMute}
          className="rounded-xl border border-black/10 px-3 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-white/10"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>
      {!!Object.keys(remoteMap).length && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          In voice:{" "}
          {Object.keys(remoteMap)
            .map((id) => participantName[id] || id)
            .join(", ")}
        </p>
      )}
      {Object.entries(remoteMap).map(([peerId, stream]) => (
        <audio
          key={peerId}
          autoPlay
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
        />
      ))}
    </div>
  );
}
