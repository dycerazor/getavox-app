'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SimliClient } from 'simli-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, MicOff, Play, Square, Loader2, BrainCircuit, Activity } from 'lucide-react';
import { getSimliToken } from '@/app/actions/simli';
import { talkToCoach } from '@/ai/flows/realtime-ai-coaching';
import { base64PcmToInt16Array } from '@/lib/simli-utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useUser, useFirestore } from '@/firebase';
import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { addDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';

const DEFAULT_FACE_ID = "tmp_face_id_placeholder";

export function MascotCoachInterface() {
  const { user } = useUser();
  const db = useFirestore();

  const [isActive, setIsActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
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
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscription(text);
        handleUserSpeech(text);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handleUserSpeech = async (text: string) => {
    if (!text || !isActive) return;

    setIsThinking(true);
    try {
      // 1. Persist User Message to Firestore
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

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: text },
        { role: 'model', content: response.aiResponseText }
      ]);

      // 2. Persist AI Response to Firestore
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

      // Create a new session in Firestore if authenticated
      if (user && db) {
        const sessionsRef = collection(db, 'users', user.uid, 'coachingSessions');
        const sessionPromise = addDocumentNonBlocking(sessionsRef, {
          userId: user.uid,
          startTime: serverTimestamp(),
          status: 'started',
          summary: '',
        });
        
        // addDocumentNonBlocking returns a promise for the ref
        const sessionRef = await sessionPromise;
        if (sessionRef) {
          setCurrentSessionId(sessionRef.id);
        }
      }

      setIsActive(true);
    } catch (error) {
      console.error("Failed to start coaching:", error);
      alert("Error initializing session. Please check your API keys.");
    } finally {
      setIsInitializing(false);
    }
  }, [user, db]);

  const stopCoaching = useCallback(() => {
    if (simliClientRef.current) {
      simliClientRef.current.close();
      simliClientRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Mark session as completed in Firestore
    if (user && db && currentSessionId) {
      const sessionRef = doc(db, 'users', user.uid, 'coachingSessions', currentSessionId);
      setDocumentNonBlocking(sessionRef, {
        status: 'completed',
        endTime: serverTimestamp(),
      }, { merge: true });
    }

    setIsActive(false);
    setIsListening(false);
    setConversationHistory([]);
    setTranscription('');
    setCurrentSessionId(null);
  }, [user, db, currentSessionId]);

  const toggleListening = () => {
    if (!isActive) return;
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscription('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-4xl mx-auto p-4">
      <div className="relative w-full aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 group">
        {!isActive && !isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800/80 backdrop-blur-sm transition-all">
            <BrainCircuit className="w-16 h-16 text-accent mb-4 animate-pulse" />
            <h3 className="text-white text-xl font-headline font-semibold mb-6">Your AI Coach is ready</h3>
            <Button 
              size="lg" 
              onClick={startCoaching}
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-8 py-6 rounded-full shadow-lg hover:scale-105 transition-transform"
            >
              <Play className="mr-2 h-5 w-5 fill-current" />
              Start Coaching Session
            </Button>
          </div>
        )}

        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 transition-all">
            <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
            <p className="text-slate-300 font-medium">Initializing secure connection...</p>
          </div>
        )}

        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className={cn("w-full h-full object-cover", !isActive && "hidden")} 
        />
        
        <audio ref={audioRef} autoPlay />

        {isActive && (
          <div className="absolute top-4 left-4 flex gap-2">
            <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Live
            </Badge>
            {isThinking && (
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30 animate-pulse">
                Thinking...
              </Badge>
            )}
          </div>
        )}

        {isActive && (
          <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/40 backdrop-blur-md p-4 rounded-xl max-w-[70%] border border-white/10">
              <p className="text-white text-sm font-medium italic">
                {isListening ? "Listening..." : transcription || "Click mic to speak to your coach"}
              </p>
            </div>
            <Button 
              variant="destructive" 
              size="icon" 
              onClick={stopCoaching}
              className="rounded-full h-12 w-12 shadow-xl"
            >
              <Square className="h-5 w-5 fill-current" />
            </Button>
          </div>
        )}
      </div>

      <Card className="w-full bg-white/50 border-none shadow-sm backdrop-blur-sm">
        <CardContent className="p-6 flex items-center justify-center gap-4">
          <Button
            size="lg"
            variant={isListening ? "destructive" : "default"}
            disabled={!isActive || isThinking}
            onClick={toggleListening}
            className={cn(
              "rounded-full h-16 w-16 shadow-xl transition-all duration-300",
              isListening && "animate-pulse scale-110",
              !isActive && "opacity-50 grayscale"
            )}
          >
            {isListening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </Button>
          
          <div className="flex flex-col">
            <h4 className="font-headline font-bold text-slate-800">
              {isActive ? "Voice Control" : "Session Inactive"}
            </h4>
            <p className="text-sm text-slate-500">
              {isActive ? (isListening ? "Speak now..." : "Press microphone to talk") : "Initialize coach to start talking"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}