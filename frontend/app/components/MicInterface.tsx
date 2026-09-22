/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";

interface MicInterfaceProps {
  onSpeechTranscribed: (text: string) => void;
  disabled?: boolean;
}

export function MicInterface({ onSpeechTranscribed, disabled }: MicInterfaceProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState(0);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript.trim()) {
          onSpeechTranscribed(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error !== "no-speech") {
          setIsRecording(false);
        }
      };

      recognition.onend = () => {
        // If it stops unexpectedly while we want it to record, we could restart it here
        // But for this prototype, we'll just set state to false.
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, [onSpeechTranscribed]);

  const toggleRecording = () => {
    if (disabled) return;
    
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  // Simulated Web Audio API volume level when recording (for visual effect)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setVolume(Math.random() * 0.8 + 0.2);
      }, 100);
    }
    return () => {
      clearInterval(interval);
      setVolume(0);
    };
  }, [isRecording]);

  return (
    <div className={`flex flex-col items-center justify-center p-8 gap-6 rounded-3xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 backdrop-blur-xl ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="relative flex items-center justify-center w-32 h-32">
        {/* Pulsing rings when recording */}
        {isRecording && (
          <>
            <motion.div
              className="absolute w-full h-full rounded-full bg-blue-500/20"
              animate={{
                scale: [1, 1 + volume * 0.5, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="absolute w-full h-full rounded-full bg-blue-500/30"
              animate={{
                scale: [1, 1 + volume * 1, 1],
                opacity: [0.8, 0, 0.8],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.2,
              }}
            />
          </>
        )}

        <button
          onClick={toggleRecording}
          disabled={disabled}
          className={`relative z-10 flex items-center justify-center w-20 h-20 rounded-full shadow-lg transition-colors duration-300 ${
            isRecording
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          }`}
        >
          {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </button>
      </div>

      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {isRecording ? "Listening... (Speak now)" : "Tap to Speak"}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-[200px] mx-auto">
          {isRecording ? "Transcribing speech..." : "Requires camera analysis to begin."}
        </p>
      </div>
    </div>
  );
}
