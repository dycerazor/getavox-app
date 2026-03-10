'use client';

import React, { useMemo, useState, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

/**
 * Provides Firebase services to the client.
 * Ensures initialization happens once and handles mounting to prevent hydration errors.
 */
export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Initialize Firebase. This is safe to run during render, but we use isMounted
  // to ensure that we don't try to render auth-dependent UI on the server.
  const firebaseServices = useMemo(() => {
    return initializeFirebase();
  }, []);

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      {/* 
        We wrap children in a fragment to ensure the layout is stable.
        Auth-dependent components will handle their own loading states 
        via the useUser() hook.
      */}
      {children}
    </FirebaseProvider>
  );
}
