"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileUp, MessageSquare, Wifi, WifiOff } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { CameraScanner } from "../../components/CameraScanner";
import { MicInterface } from "../../components/MicInterface";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8005";
type Message = { id: string; sender: "student" | "examiner"; text: string };
type AudioPayload = { base64: string; mimeType: string };
type ServerEvent = { type: string; payload: string };

export default function VivaPage() {
  const [context, setContext] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [faceDetected, setFaceDetected] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectSocketRef = useRef<() => void>(() => undefined);
  const mountedRef = useRef(false);
  const contextRef = useRef("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback((sender: Message["sender"], text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    setMessages((current) => current.some((message) => message.sender === sender && message.text === cleanText) ? current : [...current, { id: crypto.randomUUID(), sender, text: cleanText }]);
  }, []);

  const connectSocket = useCallback(() => {
    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;
    const socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws/viva`);
    socketRef.current = socket;
    console.log("[VivaPage] opening WebSocket");
    socket.onopen = () => {
      console.log("[VivaPage] WebSocket onopen");
      setConnected(true);
      setError("");
      if (contextRef.current) socket.send(JSON.stringify({ type: "start", payload: contextRef.current }));
    };
    socket.onmessage = (event) => {
      console.log("[VivaPage] WebSocket onmessage", event.data);
      try {
        const message = JSON.parse(event.data) as ServerEvent;
        if (message.type === "ready" || message.type === "ai_speaking") { addMessage("examiner", message.payload); setProcessing(false); }
        else if (message.type === "transcript") addMessage("student", message.payload);
        else if (message.type === "processing") setProcessing(true);
        else if (message.type === "ai_done") setProcessing(false);
        else if (message.type === "error") { console.error("[VivaPage] server error", message.payload); setError(message.payload); setProcessing(false); }
      } catch (parseError) { console.error("[VivaPage] invalid WebSocket message", parseError); setError("The server sent an invalid response."); }
    };
    socket.onerror = (event) => {
      if (socketRef.current !== socket) {
        console.log("[VivaPage] ignored stale WebSocket error");
        return;
      }
      console.error("[VivaPage] WebSocket onerror", event);
      setError("Voice connection failed. Check the backend on port 8005.");
      setConnected(false);
      setProcessing(false);
    };
    socket.onclose = (event) => {
      console.log("[VivaPage] WebSocket onclose", { code: event.code, reason: event.reason, wasClean: event.wasClean });
      setConnected(false); setProcessing(false);
      if (socketRef.current === socket) socketRef.current = null;
      if (mountedRef.current && reconnectTimerRef.current === null) reconnectTimerRef.current = window.setTimeout(() => { reconnectTimerRef.current = null; if (mountedRef.current) connectSocketRef.current(); }, 1000);
    };
  }, [addMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connectSocketRef.current = connectSocket;
    connectSocket();
    return () => { mountedRef.current = false; if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; socketRef.current?.close(1000, "Viva page closed"); socketRef.current = null; };
  }, [connectSocket]);

  useEffect(() => { if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight; }, [messages]);

  const startSession = (documentContext: string) => {
    contextRef.current = documentContext;
    setContext(documentContext);
    setError("");
    connectSocket();
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: "start", payload: documentContext }));
  };

  const sendAudio = ({ base64, mimeType }: AudioPayload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) { setError("Voice connection is not ready. Please try again."); return; }
    setProcessing(true);
    socket.send(JSON.stringify({ type: "audio", payload: base64, mimeType }));
    console.log("[VivaPage] complete audio sent", { base64Chars: base64.length, mimeType });
  };

  const sendTranscript = (text: string) => {
    const cleanText = text.trim();
    const socket = socketRef.current;
    if (!cleanText || !socket || socket.readyState !== WebSocket.OPEN) return;
    addMessage("student", cleanText);
    setProcessing(true);
    socket.send(JSON.stringify({ type: "transcript", payload: cleanText }));
    console.log("[VivaPage] final browser transcript sent", cleanText);
  };

  const uploadDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(""); setUploading(true); setUploadStatus("Uploading and extracting context...");
    const formData = new FormData(); formData.append("file", file);
    try {
      const response = await fetch(`${API_URL}/api/upload`, { method: "POST", body: formData });
      if (!response.ok) throw new Error(`Upload failed with status ${response.status}`);
      const data = (await response.json()) as { extracted_text: string; characters?: number };
      setUploadStatus(`Document ready: ${data.characters ?? data.extracted_text.length} characters extracted.`);
      startSession(data.extracted_text);
    } catch (uploadError) { console.error("[VivaPage] document upload failed", uploadError); setUploadStatus(""); setError("Document upload failed. Check the backend and try again."); }
    finally { setUploading(false); }
  };

  return <main className="min-h-screen"><div className="mx-auto max-w-7xl px-5 py-5 sm:px-8"><header className="flex items-center justify-between border-b border-[var(--line)] pb-5"><Link href="/" className="flex min-h-[48px] items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft className="h-4 w-4" /> Exit session</Link><div className="flex items-center gap-3"><span className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${connected ? "text-teal-600" : "text-slate-400"}`}>{connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{connected ? "Live" : "Waiting"}</span><ThemeToggle /></div></header>{error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}<div className="grid gap-8 py-8 lg:grid-cols-[.85fr_1.15fr]"><section><div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-600 dark:text-teal-300">01 / Bring your context</p><h1 className="mt-2 font-[var(--font-display)] text-3xl font-bold">Set the table.</h1><p className="mt-2 text-[var(--muted)]">Scan a page or upload your study material before the first question.</p></div><CameraScanner onScanComplete={startSession} onFaceDetected={setFaceDetected} /><label className={`button-secondary mt-3 min-h-[48px] w-full cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}><FileUp className="h-4 w-4" /> {uploading ? "Uploading document..." : "Upload document"}<input type="file" accept="image/*,.pdf,.txt,.md,.csv" className="hidden" onChange={uploadDocument} /></label>{uploadStatus && <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-300">{uploadStatus}</p>}{context && <div className="panel mt-4 p-4"><div className="flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-300"><CheckCircle2 className="h-4 w-4" /> Context loaded</div><p className="mt-2 line-clamp-4 text-sm leading-6 text-[var(--muted)]">{context}</p></div>}</section><section className="flex min-h-[620px] flex-col"><div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-600 dark:text-teal-300">02 / Defend your thinking</p><h2 className="mt-2 font-[var(--font-display)] text-3xl font-bold">The viva room.</h2></div><div ref={transcriptRef} className="panel mb-4 min-h-[290px] flex-1 space-y-5 overflow-y-auto p-5">{messages.length === 0 ? <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center text-[var(--muted)]"><MessageSquare className="mb-3 h-7 w-7 text-teal-500" /><p className="font-semibold">Your examiner is ready when you are.</p><p className="mt-1 text-sm">Scan or upload a document to begin.</p></div> : messages.map((message) => <div key={message.id} className={`flex ${message.sender === "student" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.sender === "student" ? "rounded-br-sm bg-[#102f32] text-white dark:bg-teal-300 dark:text-slate-950" : "rounded-bl-sm bg-teal-50 text-slate-800 dark:bg-teal-950/50 dark:text-teal-50"}`}><p className="mb-1 text-[10px] font-bold uppercase tracking-widest opacity-60">{message.sender === "student" ? "You" : "Professor Viva"}</p>{message.text}</div></div>)}</div><MicInterface faceDetected={faceDetected} onAudioCaptured={sendAudio} onSpeechTranscribed={sendTranscript} disabled={!context || !connected} processing={processing} /></section></div></div></main>;
}
