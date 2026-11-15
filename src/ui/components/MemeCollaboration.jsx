import { useEffect, useRef, useState } from "react";
import { normalizeMemeSettings } from "../services/memeShare.js";

const MAX_SIGNAL_LENGTH = 100_000;
const MAX_MESSAGE_BYTES = 256_000;

function waitForIceGathering(peer) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error("ICE gathering timed out. Try again or use a STUN server."));
    }, 30_000);
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
    };
    peer.addEventListener("icegatheringstatechange", onStateChange);
  });
}

function readSignal(value, expectedType) {
  if (value.length > MAX_SIGNAL_LENGTH) {
    throw new Error("The signaling message is too large.");
  }
  let description;
  try {
    description = JSON.parse(value);
  } catch (cause) {
    throw new Error("Paste the complete signaling message as JSON.", { cause });
  }
  if (
    !description ||
    description.type !== expectedType ||
    typeof description.sdp !== "string"
  ) {
    throw new Error(`The signaling message must contain a ${expectedType}.`);
  }
  return description;
}

export function MemeCollaboration({ settings, onReceiveSettings }) {
  const peerRef = useRef(null);
  const channelRef = useRef(null);
  const lastSentRef = useRef("");
  const signalOutputRef = useRef(null);
  const [mode, setMode] = useState("host");
  const [stunServer, setStunServer] = useState("");
  const [signalInput, setSignalInput] = useState("");
  const [signalOutput, setSignalOutput] = useState("");
  const [connectionState, setConnectionState] = useState("not connected");
  const [feedback, setFeedback] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  function makePeer() {
    if (typeof globalThis.RTCPeerConnection !== "function") {
      throw new Error("WebRTC data channels are not supported in this browser.");
    }
    const urls = stunServer.trim();
    const peer = new globalThis.RTCPeerConnection({
      iceServers: urls ? [{ urls }] : [],
    });
    peer.addEventListener("connectionstatechange", () => {
      setConnectionState(peer.connectionState);
    });
    peer.addEventListener("datachannel", (event) => attachChannel(peer, event.channel));
    peerRef.current = peer;
    return peer;
  }

  function attachChannel(peer, channel) {
    channelRef.current = channel;
    channel.addEventListener("open", () => {
      setConnectionState("connected");
      setFeedback("Connected. Editor settings are syncing directly between browsers.");
      lastSentRef.current = "";
    });
    channel.addEventListener("close", () => setConnectionState(peer.connectionState));
    channel.addEventListener("error", () => {
      setFeedback("The peer data channel reported an error.");
    });
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_BYTES) {
        setFeedback("Ignored an invalid or oversized collaboration message.");
        return;
      }
      try {
        const message = JSON.parse(event.data);
        if (message?.type !== "settings") throw new Error("Unknown collaboration message.");
        onReceiveSettings(normalizeMemeSettings(message.settings));
        setFeedback("Received updated editor settings from your collaborator.");
      } catch (cause) {
        setFeedback(`Incoming editor settings were rejected. ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    });
  }

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    const message = JSON.stringify({ type: "settings", settings });
    if (message === lastSentRef.current) return;
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      setFeedback("These settings are too large to sync; simplify drawing layers and try again.");
      return;
    }
    try {
      channel.send(message);
      lastSentRef.current = message;
    } catch (cause) {
      setFeedback(`Editor settings could not be sent. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }, [settings]);

  useEffect(() => () => {
    channelRef.current?.close();
    peerRef.current?.close();
  }, []);

  async function createInvitation() {
    setIsWorking(true);
    setFeedback("Creating a direct connection offer…");
    try {
      channelRef.current?.close();
      peerRef.current?.close();
      const peer = makePeer();
      attachChannel(peer, peer.createDataChannel("miimes-editor"));
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGathering(peer);
      setSignalOutput(JSON.stringify(peer.localDescription));
      setConnectionState("waiting for answer");
      setFeedback("Copy this offer to your collaborator. Paste their answer below to connect.");
    } catch (cause) {
      setFeedback(`Room offer could not be created. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsWorking(false);
    }
  }

  async function joinInvitation() {
    setIsWorking(true);
    setFeedback("Connecting to the invitation…");
    try {
      channelRef.current?.close();
      peerRef.current?.close();
      const peer = makePeer();
      await peer.setRemoteDescription(readSignal(signalInput, "offer"));
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForIceGathering(peer);
      setSignalOutput(JSON.stringify(peer.localDescription));
      setConnectionState("answer ready");
      setFeedback("Copy this answer back to the room creator. The connection starts when they apply it.");
    } catch (cause) {
      setFeedback(`Invitation could not be joined. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsWorking(false);
    }
  }

  async function applyAnswer() {
    setIsWorking(true);
    setFeedback("Applying the room answer…");
    try {
      if (!peerRef.current || peerRef.current.signalingState !== "have-local-offer") {
        throw new Error("Create a room offer before applying its answer.");
      }
      await peerRef.current.setRemoteDescription(readSignal(signalInput, "answer"));
      setFeedback("Answer applied. Waiting for the direct data channel to connect…");
    } catch (cause) {
      setFeedback(`Room answer could not be applied. ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setIsWorking(false);
    }
  }

  async function copySignal() {
    if (!signalOutput) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard text access is unavailable.");
      await navigator.clipboard.writeText(signalOutput);
      setFeedback("Signaling message copied.");
    } catch (cause) {
      signalOutputRef.current?.select();
      setFeedback(`Copy failed; select and copy the message manually. ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  function closeRoom() {
    channelRef.current?.close();
    peerRef.current?.close();
    channelRef.current = null;
    peerRef.current = null;
    lastSentRef.current = "";
    setSignalOutput("");
    setConnectionState("not connected");
    setFeedback("Collaboration room closed.");
  }

  function changeMode(nextMode) {
    if (nextMode === mode) return;
    channelRef.current?.close();
    peerRef.current?.close();
    channelRef.current = null;
    peerRef.current = null;
    lastSentRef.current = "";
    setSignalInput("");
    setSignalOutput("");
    setConnectionState("not connected");
    setFeedback("");
    setMode(nextMode);
  }

  return (
    <details className="meme-collaboration">
      <summary>Collaborate live</summary>
      <p>
        Exchange an offer and answer manually; editor settings then sync peer-to-peer.
        No room server receives your edits. Both people must open the same media first.
      </p>
      <label className="meme-editor-field">
        <span>Optional STUN server for connecting across networks</span>
        <input
          value={stunServer}
          maxLength={300}
          onChange={(event) => setStunServer(event.target.value)}
          placeholder="stun:stun.l.google.com:19302"
          inputMode="url"
        />
      </label>
      <p className="meme-collaboration-note">
        Without STUN, direct connections may only work on compatible networks. A STUN
        server can see network addresses in the connection handshake; it does not receive
        meme media or editor settings.
      </p>
      <div className="meme-collaboration-mode" role="group" aria-label="Collaboration role">
        <button type="button" aria-pressed={mode === "host"} onClick={() => changeMode("host")}>
          Create room
        </button>
        <button type="button" aria-pressed={mode === "guest"} onClick={() => changeMode("guest")}>
          Join room
        </button>
      </div>
      {mode === "host" ? (
        <button type="button" onClick={createInvitation} disabled={isWorking}>
          {isWorking ? "Preparing…" : "Create offer"}
        </button>
      ) : (
        <button type="button" onClick={joinInvitation} disabled={isWorking || !signalInput.trim()}>
          {isWorking ? "Preparing…" : "Create answer"}
        </button>
      )}
      {signalOutput && (
        <label className="meme-editor-field">
          <span>{mode === "host" ? "Room offer" : "Room answer"} · copy to your collaborator</span>
          <textarea
            ref={signalOutputRef}
            readOnly
            value={signalOutput}
            rows={4}
            onFocus={(event) => event.target.select()}
          />
          <button type="button" onClick={copySignal}>Copy signaling message</button>
        </label>
      )}
      <label className="meme-editor-field">
        <span>
          {mode === "host" ? "Paste your collaborator’s answer" : "Paste the room creator’s offer"}
        </span>
        <textarea
          value={signalInput}
          maxLength={MAX_SIGNAL_LENGTH}
          rows={4}
          onChange={(event) => setSignalInput(event.target.value)}
          placeholder="Paste the complete JSON signaling message"
        />
      </label>
      {mode === "host" ? (
        <button
          type="button"
          onClick={applyAnswer}
          disabled={isWorking || !signalInput.trim()}
        >
          Apply answer
        </button>
      ) : (
        <p className="meme-collaboration-note">After creating an answer, send it back to the room creator.</p>
      )}
      <p className="meme-collaboration-status" role="status">
        Connection: {connectionState}
        {feedback && ` · ${feedback}`}
      </p>
      {connectionState !== "not connected" && (
        <button type="button" className="meme-editor-secondary" onClick={closeRoom}>
          Close room
        </button>
      )}
    </details>
  );
}
