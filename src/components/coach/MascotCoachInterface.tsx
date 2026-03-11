'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimliClient } from 'simli-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, MicOff, Play, Square, Loader2, BrainCircuit, Activity, Phone, PhoneOff } from 'lucide-react';
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
  const [transcription, setTranscription] = useState('');
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simliClientRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Stay on for a "live" feel
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

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
          recognition.start(); // Auto-restart for continuous listening
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          setIsListening(false);
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
        
        if (sessionRef) {
          setCurrentSessionId(sessionRef.id);
        }
      }

      setIsActive(true);
      setIsListening(true);
      recognitionRef.current?.start();

      toast({
        title: "Coach Connected",
        description: "Your live session has started.",
      });
    } catch (error) {
      console.error("Failed to start coaching:", error);
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Check your internet and API keys.",
      });
    } finally {
      setIsInitializing(false);
    }
  }, [user, db, toast]);

  const stopCoaching = useCallback(async () => {
    setIsSummarizing(true);
    const messagesToSummarize = conversationHistory.map(m => ({
      role: m.role === 'model' ? 'ai' as const : 'user' as const,
      content: m.content
    }));

    if (simliClientRef.current) {
      simliClientRef.current.close();
      simliClientRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    try {
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
        description: "Your growth progress has been saved.",
      });
    } catch (error) {
      console.error("Failed to summarize session:", error);
    } finally {
      setIsActive(false);
      setIsListening(false);
      setIsSummarizing(false);
      setConversationHistory([]);
      setTranscription('');
      setCurrentSessionId(null);
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

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-4xl mx-auto p-4">
      <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 group ring-4 ring-primary/20">
        {!isActive && !isInitializing && !isSummarizing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800/80 backdrop-blur-md z-20">
            <div className="bg-primary/20 p-6 rounded-full mb-6">
              <BrainCircuit className="w-20 h-20 text-accent animate-pulse" />
            </div>
            <h3 className="text-white text-2xl font-headline font-bold mb-8">Start Live Coaching Call</h3>
            <Button 
              size="lg" 
              onClick={startCoaching}
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-10 py-8 rounded-full shadow-2xl hover:scale-105 transition-all flex gap-3 text-xl"
            >
              <Phone className="h-6 w-6 fill-current" />
              Join Call
            </Button>
          </div>
        )}

        {(isInitializing || isSummarizing) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-30">
            <Loader2 className="w-16 h-16 text-accent animate-spin mb-6" />
            <p className="text-slate-300 font-bold text-lg tracking-widest uppercase">
              {isInitializing ? "Connecting to Live Stream..." : "Hanging up & Saving..."}
            </p>
          </div>
        )}

        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className={cn("w-full h-full object-cover", !isActive && "opacity-0")} 
        />
        
        <audio ref={audioRef} autoPlay />

        {isActive && (
          <>
            <div className="absolute top-6 left-6 flex gap-3 z-10">
              <Badge variant="secondary" className="bg-red-500 text-white border-none px-3 py-1 flex items-center gap-2 animate-pulse font-bold">
                <div className="w-2 h-2 rounded-full bg-white" /> LIVE
              </Badge>
              {isThinking && (
                <Badge variant="outline" className="bg-accent/20 text-accent border-accent/40 backdrop-blur-md">
                  AI Responding...
                </Badge>
              )}
            </div>

            <div className="absolute bottom-10 left-10 right-10 flex flex-col gap-4 pointer-events-none">
              {transcription && (
                <div className="bg-black/60 backdrop-blur-xl p-6 rounded-2xl border border-white/10 max-w-2xl animate-in slide-in-from-bottom-4">
                  <p className="text-white text-lg font-medium leading-tight">
                    {transcription}
                  </p>
                </div>
              )}
            </div>

            <div className="absolute right-6 top-6 flex flex-col gap-4 z-10">
              <Button 
                variant="destructive" 
                size="icon" 
                onClick={stopCoaching}
                className="rounded-full h-14 w-14 shadow-2xl hover:scale-110 transition-transform bg-red-600 hover:bg-red-700"
              >
                <PhoneOff className="h-6 w-6 fill-current" />
              </Button>
            </div>
          </>
        )}
      </div>

      <Card className="w-full bg-white/40 border-none shadow-xl backdrop-blur-xl">
        <CardContent className="p-8 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button
              size="lg"
              variant={isListening ? "destructive" : "secondary"}
              disabled={!isActive || isThinking || isSummarizing}
              onClick={toggleListening}
              className={cn(
                "rounded-full h-20 w-20 shadow-2xl transition-all duration-500",
                isListening && "animate-pulse ring-8 ring-red-500/20",
                (!isActive || isSummarizing) && "opacity-20 grayscale"
              )}
            >
              {isListening ? <MicOff className="h-10 w-10" /> : <Mic className="h-10 w-10" />}
            </Button>
            
            <div className="flex flex-col">
              <h4 className="font-headline font-extrabold text-2xl text-slate-900">
                {isActive ? (isListening ? "Coach is Listening" : "Microphone Muted") : "Disconnected"}
              </h4>
              <p className="text-slate-500 font-medium">
                {isActive ? (isListening ? "Speak naturally to your coach." : "Unmute to continue the conversation.") : "Join the call to start your session."}
              </p>
            </div>
          </div>

          {isActive && (
            <div className="hidden md:flex items-center gap-4">
              <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                  <div 
                    key={i} 
                    className={cn(
                      "w-1 bg-primary rounded-full transition-all duration-300",
                      isListening ? "animate-bounce" : "h-2",
                      i === 1 && "h-4 delay-75",
                      i === 2 && "h-8 delay-150",
                      i === 3 && "h-6 delay-300",
                      i === 4 && "h-4 delay-450"
                    )}
                  />
                ))}
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Audio Active</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
