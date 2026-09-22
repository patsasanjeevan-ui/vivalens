"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Radio } from "lucide-react";

type MicInterfaceProps = {
  disabled?: boolean;
  faceDetected?: boolean;
  processing?: boolean;
  onAudioCaptured: (audio: { base64: string; mimeType: string }) => void;
  onSpeechTranscribed?: (text: string) => void;
};
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: SpeechEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
type SpeechConstructor = new () => SpeechRecognitionLike;
type SpeechWindow = Window & typeof globalThis & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor; webkitAudioContext?: typeof AudioContext };

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1] ?? "") : reject(new Error("Invalid audio data."));
    reader.onerror = () => reject(reader.error ?? new Error("Could not encode audio."));
    reader.readAsDataURL(blob);
  });
}

export function MicInterface({ disabled = false, processing = false, onAudioCaptured, onSpeechTranscribed }: MicInterfaceProps) {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    recorderRef.current?.stop();
    recognitionRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    void contextRef.current?.close();
  }, []);

  const updateLevel = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const values = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(values);
    const rms = Math.sqrt(values.reduce((sum, value) => sum + (value - 128) ** 2, 0) / values.length) / 128;
    setLevel(Math.min(1, rms * 3));
    frameRef.current = requestAnimationFrame(updateLevel);
  };

  const releaseResources = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    void contextRef.current?.close();
    contextRef.current = null;
    setRecording(false);
    setLevel(0);
  };

  const startRecording = async () => {
    setError("");
    try {
      console.log("[MicInterface] requesting microphone from direct user click");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const AudioContextClass = (window as SpeechWindow).AudioContext ?? (window as SpeechWindow).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is unavailable.");
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      contextRef.current = audioContext;
      analyserRef.current = analyser;
      const SpeechRecognition = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (result.isFinal) onSpeechTranscribed?.(result[0].transcript.trim());
          }
        };
        recognition.onerror = (event) => console.warn("[MicInterface] SpeechRecognition fallback error", event.error);
        recognition.onend = () => console.log("[MicInterface] SpeechRecognition fallback ended");
        recognitionRef.current = recognition;
        recognition.start();
        console.log("[MicInterface] SpeechRecognition fallback started");
      }
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => { console.error("[MicInterface] MediaRecorder error"); setError("The browser could not record audio."); releaseResources(); };
      recorder.onstop = async () => {
        recognitionRef.current?.stop();
        const chunks = chunksRef.current;
        chunksRef.current = [];
        releaseResources();
        if (!chunks.length) { setError("No audio was captured. Please try again."); return; }
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
          const base64 = await blobToBase64(blob);
          console.log("[MicInterface] complete audio encoded", { bytes: blob.size, base64Chars: base64.length });
          onAudioCaptured({ base64, mimeType: blob.type });
        } catch (encodingError) {
          console.error("[MicInterface] audio encoding failed", encodingError);
          setError("Audio encoding failed. Please try again.");
        }
      };
      recorder.start(250);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      updateLevel();
    } catch (captureError) {
      console.error("[MicInterface] microphone setup failed", captureError);
      const name = captureError instanceof DOMException ? captureError.name : "";
      setError(name === "NotAllowedError" ? "Microphone permission was denied. Allow access and try again." : name === "NotReadableError" ? "Microphone is busy in another tab or app. Close other recording pages and retry." : "Microphone setup failed. Check your browser permissions.");
    }
  };

  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const bars = Array.from({ length: 18 }, (_, index) => 0.35 + Math.abs(Math.sin(index * 1.7)) * 0.65);
  return <div className="panel flex flex-col items-center gap-5 p-6 text-center"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-teal-600 dark:text-teal-300"><Radio className="h-4 w-4" /> Voice channel</div><div className="flex h-12 items-center gap-1.5" aria-hidden="true">{bars.map((bar, index) => <motion.span key={index} className="w-1.5 rounded-full bg-teal-400" animate={{ height: recording || processing ? `${Math.max(10, bar * (18 + level * 32))}px` : "10px", opacity: processing ? 0.45 : 1 }} transition={{ duration: 0.12 }} />)}</div><button onClick={() => (recording ? stopRecording() : void startRecording())} disabled={disabled || processing} className={`relative flex min-h-[80px] min-w-[80px] items-center justify-center rounded-full text-white shadow-xl transition ${recording ? "bg-rose-500" : "bg-slate-900 dark:bg-teal-400 dark:text-slate-950"}`} aria-label={recording ? "Stop recording" : "Start recording"}>{recording ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}</button><div><p className="font-semibold text-slate-900 dark:text-white">{processing ? "Processing answer..." : recording ? `Listening ${seconds}s` : "Tap to answer"}</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{disabled ? "Scan a document to unlock the viva" : "Audio and browser transcription are active"}</p></div>{error && <p role="alert" className="max-w-sm text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}</div>;
}
