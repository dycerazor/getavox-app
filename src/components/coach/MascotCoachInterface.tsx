'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimliClient } from 'simli-client';
// Import MediaPipe as side-effects because they often lack proper ESM exports
import '@mediapipe/pose';
import '@mediapipe/camera_utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Mic, MicOff, Loader2, BrainCircuit, Activity, Phone, PhoneOff, Camera as CameraIcon, User, Video, VideoOff } from 'lucide-react';
import { getSimliToken } from '@/app/actions/simli';
import { talkToCoach } from '@/ai/flows/realtime-ai-coaching';
import { summarizeSession } from '@/ai/flows/summarize-session';
import { base64PcmToInt16Array } from '@/lib/simli-utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useUser, useFirestore } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_FACE_ID = "tmp_face_id_placeholder";

export function MascotCoachInterface() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [isActive, setIsActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isVisionEnabled, setIsVisionEnabled] = useState(true);
  const [transcription, setTranscription] = useState('');
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [userPosture, setUserPosture] = useState('good');

  const videoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simliClientRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const poseRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  // Initialize MediaPipe Pose and Camera only when active and permission is granted
  useEffect(() => {
    if (!isActive || !hasCameraPermission || !userVideoRef.current) {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      return;
    }

    const PoseClass = (window as any).Pose;
    const CameraClass = (window as any).Camera;

    if (!PoseClass || !CameraClass) {
      console.warn('MediaPipe Pose or Camera not found on window object.');
      return;
    }

    const pose = new PoseClass({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      },
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results: any) => {
      if (results.poseLandmarks && isVisionEnabled) {
        const nose = results.poseLandmarks[0];
        const leftShoulder = results.poseLandmarks[11];
        const rightShoulder = results.poseLandmarks[12];
        const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
        
        if (shoulderAvgY - nose.y < 0.15) {
          setUserPosture('slouching or leaning forward');
        } else if (Math.abs(leftShoulder.y - rightShoulder.y) > 0.1) {
          setUserPosture('leaning to the side');
        } else {
          setUserPosture('sitting upright');
        }
      }
    });

    poseRef.current = pose;

    const camera = new CameraClass(userVideoRef.current, {
        onFrame: async () => {
            if (poseRef.current && userVideoRef.current && isVisionEnabled) {
                await poseRef.current.send({ image: userVideoRef.current });
            }
        },
        width: 640,
        height: 480,
    });
    
    camera.start();
    cameraRef.current = camera;

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
    };
  }, [isActive, hasCameraPermission, isVisionEnabled]);

  // Speech Recognition Logic
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setTranscription(finalTranscript);
          handleUserSpeech(finalTranscript);
        } else {
          setTranscription(interimTranscript);
        }
      };

      recognition.onend = () => {
        if (isActive && isListening) {
          recognition.start();
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [isActive, isListening]);

  const handleUserSpeech = async (text: string) => {
    if (!text || !isActive) return;

    setIsThinking(true);
    try {
      if (user && db && currentSessionId) {
        const messagesRef = collection(db, 'users', user.uid, 'coachingSessions', currentSessionId, 'sessionMessages');
        addDocumentNonBlocking(messagesRef, {
          sessionId: currentSessionId,
          sender: 'user',
          contentType: 'text',
          textContent: text,
          timestamp: serverTimestamp(),
        });
      }

      const response = await talkToCoach({
        userInputText: text,
        userPosture: isVisionEnabled ? userPosture : "Vision Disabled",
        conversationHistory: conversationHistory
      });

      const updatedHistory = [
        ...conversationHistory,
        { role: 'user' as const, content: text },
        { role: 'model' as const, content: response.aiResponseText }
      ];
      setConversationHistory(updatedHistory);

      if (user && db && currentSessionId) {
        const messagesRef = collection(db, 'users', user.uid, 'coachingSessions', currentSessionId, 'sessionMessages');
        addDocumentNonBlocking(messagesRef, {
          sessionId: currentSessionId,
          sender: 'ai',
          contentType: 'text',
          textContent: response.aiResponseText,
          timestamp: serverTimestamp(),
        });
      }

      const pcmData = base64PcmToInt16Array(response.aiResponseAudioUri);
      if (simliClientRef.current) {
        simliClientRef.current.sendAudioData(pcmData);
      }
    } catch (error) {
      console.error('Coaching turn error:', error);
    } finally {
      setIsThinking(false);
      setTranscription('');
    }
  };

  const startCoaching = useCallback(async () => {
    setIsInitializing(true);
    
    // Request Camera Permission only when joining
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setHasCameraPermission(true);
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      setIsInitializing(false);
      toast({
        variant: "destructive",
        title: "Camera Required",
        description: "Please enable camera access to join the coaching call.",
      });
      return;
    }

    try {
      const token = await getSimliToken();
      if (!token) throw new Error("Could not retrieve Simli session token");

      const client = new SimliClient();
      simliClientRef.current = client;

      client.Initialize({
        sessionToken: token,
        faceId: DEFAULT_FACE_ID,
        handleAudioStream: (stream: MediaStream) => {
          if (audioRef.current) audioRef.current.srcObject = stream;
        },
        handleVideoStream: (stream: MediaStream) => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        },
      });

      await client.start();

      if (user && db) {
        const sessionsRef = collection(db, 'users', user.uid, 'coachingSessions');
        const sessionRef = await addDocumentNonBlocking(sessionsRef, {
          userId: user.uid,
          startTime: serverTimestamp(),
          status: 'started',
          summary: '',
        });
        if (sessionRef) setCurrentSessionId(sessionRef.id);
      }

      setIsActive(true);
      setIsListening(true);
      recognitionRef.current?.start();

      toast({
        title: "Coach Connected",
        description: "The coach can now see and hear you.",
      });
    } catch (error) {
      console.error("Failed to start coaching:", error);
    } finally {
      setIsInitializing(false);
    }
  }, [user, db, toast]);

  const stopCoaching = useCallback(async () => {
    setIsSummarizing(true);
    if (simliClientRef.current) simliClientRef.current.close();
    if (recognitionRef.current) recognitionRef.current.stop();
    if (cameraRef.current) cameraRef.current.stop();

    try {
      const messagesToSummarize = conversationHistory.map(m => ({
        role: m.role === 'model' ? 'ai' as const : 'user' as const,
        content: m.content
      }));

      let finalSummary = "";
      if (messagesToSummarize.length > 0) {
        const summaryResult = await summarizeSession({ messages: messagesToSummarize });
        finalSummary = summaryResult.summary;
      }

      if (user && db && currentSessionId) {
        const sessionRef = doc(db, 'users', user.uid, 'coachingSessions', currentSessionId);
        setDocumentNonBlocking(sessionRef, {
          status: 'completed',
          endTime: serverTimestamp(),
          summary: finalSummary,
        }, { merge: true });
      }

      toast({
        title: "Session Finished",
        description: "Growth progress saved.",
      });
    } catch (error) {
      console.error("Failed to summarize session:", error);
    } finally {
      setIsActive(false);
      setIsListening(false);
      setIsSummarizing(false);
      setConversationHistory([]);
      setCurrentSessionId(null);
      setHasCameraPermission(null);
    }
  }, [user, db, currentSessionId, conversationHistory, toast]);

  const toggleListening = () => {
    if (!isActive) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setTranscription('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const toggleVision = () => {
    setIsVisionEnabled(!isVisionEnabled);
    if (isVisionEnabled) {
      setUserPosture('Vision Paused');
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-5xl mx-auto p-4">
      <div className="relative w-full aspect-video bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-8 border-white/5 group ring-4 ring-primary/20">
        {!isActive && !isInitializing && !isSummarizing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800/90 backdrop-blur-lg z-20">
            <div className="bg-primary/20 p-8 rounded-full mb-6">
              <BrainCircuit className="w-24 h-24 text-accent animate-pulse" />
            </div>
            <h3 className="text-white text-3xl font-headline font-bold mb-8">Start Visual Coaching Call</h3>
            <Button 
              size="lg" 
              onClick={startCoaching}
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-extrabold px-12 py-10 rounded-full shadow-2xl hover:scale-105 transition-all flex gap-4 text-2xl"
            >
              <Phone className="h-8 w-8 fill-current" />
              Join Call
            </Button>
          </div>
        )}

        {(isInitializing || isSummarizing) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-30">
            <Loader2 className="w-16 h-16 text-accent animate-spin mb-6" />
            <p className="text-slate-300 font-bold text-lg tracking-widest uppercase">
              {isInitializing ? "Initializing Vision & AI..." : "Hanging up & Saving..."}
            </p>
          </div>
        )}

        {/* AI Video Feed */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className={cn("w-full h-full object-cover", !isActive && "opacity-0")} 
        />

        {/* User Video Feed (PiP Style) */}
        <div className={cn(
          "absolute bottom-6 right-6 w-48 aspect-video rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl transition-opacity duration-500",
          (!isActive || !isVisionEnabled) && "opacity-0"
        )}>
          <video ref={userVideoRef} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
          <div className="absolute bottom-2 left-2 bg-black/40 backdrop-blur-md px-2 py-1 rounded text-[10px] text-white flex items-center gap-1">
            <User className="w-3 h-3" /> You
          </div>
        </div>
        
        <audio ref={audioRef} autoPlay />

        {isActive && (
          <>
            <div className="absolute top-8 left-8 flex gap-4 z-10">
              <Badge variant="secondary" className="bg-red-500 text-white border-none px-4 py-2 flex items-center gap-2 animate-pulse font-bold text-sm shadow-lg">
                <div className="w-2 h-2 rounded-full bg-white" /> LIVE
              </Badge>
              <Badge variant="outline" className="bg-black/40 text-white border-white/20 backdrop-blur-md px-3 py-1 flex items-center gap-2">
                <Activity className="w-3 h-3 text-accent" /> {isVisionEnabled ? userPosture : "Vision Paused"}
              </Badge>
              {isThinking && (
                <Badge className="bg-accent text-accent-foreground border-none">
                  Coach is reflecting...
                </Badge>
              )}
            </div>

            <div className="absolute bottom-10 left-10 right-64 flex flex-col gap-4 pointer-events-none">
              {transcription && (
                <div className="bg-black/60 backdrop-blur-2xl p-6 rounded-2xl border border-white/10 max-w-xl animate-in fade-in slide-in-from-bottom-4">
                  <p className="text-white text-lg font-medium leading-relaxed">
                    {transcription}
                  </p>
                </div>
              )}
            </div>

            <div className="absolute right-8 top-8 flex flex-col gap-4 z-10">
              <Button 
                variant="destructive" 
                size="icon" 
                onClick={stopCoaching}
                className="rounded-full h-16 w-16 shadow-2xl hover:scale-110 transition-transform bg-red-600 hover:bg-red-700 ring-4 ring-red-500/20"
              >
                <PhoneOff className="h-8 w-8 fill-current" />
              </Button>
              
              <Button
                variant="secondary"
                size="icon"
                onClick={toggleVision}
                className={cn(
                  "rounded-full h-12 w-12 shadow-xl backdrop-blur-md transition-all",
                  isVisionEnabled ? "bg-white/20 text-white" : "bg-red-500 text-white"
                )}
              >
                {isVisionEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
              </Button>
            </div>
          </>
        )}
      </div>

      <Card className="w-full bg-white/60 border-none shadow-2xl backdrop-blur-3xl rounded-3xl overflow-hidden">
        <CardContent className="p-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-8 w-full md:w-auto">
            <Button
              size="lg"
              variant={isListening ? "destructive" : "secondary"}
              disabled={!isActive || isThinking || isSummarizing}
              onClick={toggleListening}
              className={cn(
                "rounded-full h-24 w-24 shadow-2xl transition-all duration-500 hover:scale-105",
                isListening && "animate-pulse ring-[12px] ring-red-500/20",
                (!isActive || isSummarizing) && "opacity-20 grayscale"
              )}
            >
              {isListening ? <MicOff className="h-12 w-12" /> : <Mic className="h-12 w-12" />}
            </Button>
            
            <div className="flex flex-col">
              <h4 className="font-headline font-extrabold text-3xl text-slate-900 mb-1">
                {isActive ? (isListening ? "Listening..." : "Paused") : "Ready for Call"}
              </h4>
              <p className="text-slate-500 text-lg font-medium">
                {isActive ? (isListening ? "The coach is analyzing your speech and posture." : "Unmute to resume.") : "Join to experience visual AI coaching."}
              </p>
            </div>
          </div>

          {isActive && (
            <div className="flex items-center gap-6 bg-slate-100/50 p-6 rounded-2xl border border-slate-200 w-full md:w-auto">
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-tighter">Audio Input</span>
                <div className="flex items-end gap-1.5 h-12">
                  {[1,2,3,4,5,6].map(i => (
                    <div 
                      key={i} 
                      className={cn(
                        "w-1.5 bg-primary rounded-full transition-all duration-300",
                        isListening ? "animate-bounce" : "h-2",
                        i === 1 && "h-4 delay-75",
                        i === 2 && "h-10 delay-150",
                        i === 3 && "h-6 delay-300",
                        i === 4 && "h-12 delay-450",
                        i === 5 && "h-8 delay-200",
                        i === 6 && "h-4 delay-100"
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="w-[1px] h-12 bg-slate-200" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-tighter">Posture Status</span>
                <span className="text-primary font-bold capitalize">{isVisionEnabled ? userPosture : "Paused"}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
