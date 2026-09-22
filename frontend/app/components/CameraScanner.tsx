/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
"use client";

import { useRef, useEffect, useState } from "react";
import { Camera, RefreshCw, Upload, CheckCircle } from "lucide-react";

interface CameraScannerProps {
  onScanComplete: (text: string) => void;
}

export function CameraScanner({ onScanComplete }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(mediaStream);
      setHasPermission(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setHasPermission(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      // Cleanup stream on unmount
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsScanning(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      const formData = new FormData();
      formData.append("file", blob, "scan.jpg");
      
      try {
        const response = await fetch("http://localhost:8000/api/upload", {
          method: "POST",
          body: formData,
        });
        
        if (response.ok) {
          const data = await response.json();
          onScanComplete(data.extracted_text);
          setScanned(true);
        } else {
          console.error("Upload failed", await response.text());
        }
      } catch (e) {
        console.error("Error uploading", e);
      } finally {
        setIsScanning(false);
      }
    }, "image/jpeg");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full aspect-[4/3] bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-xl group">
        {hasPermission === false ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4">
            <Camera className="w-8 h-8 opacity-50" />
            <p>Camera access denied or unavailable</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
        
        {/* Overlay framing guides */}
        <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-blue-500" />
          <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-blue-500" />
          <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-blue-500" />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-blue-500" />
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      <button 
        onClick={handleCapture}
        disabled={isScanning || !hasPermission}
        className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all ${
          scanned 
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800"
            : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30"
        } ${isScanning ? "opacity-70 cursor-not-allowed" : ""}`}
      >
        {isScanning ? (
          <><RefreshCw className="w-5 h-5 animate-spin" /> Analyzing...</>
        ) : scanned ? (
          <><CheckCircle className="w-5 h-5" /> Rescan Document</>
        ) : (
          <><Upload className="w-5 h-5" /> Capture & Analyze</>
        )}
      </button>
    </div>
  );
}
