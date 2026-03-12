'use client';

import { useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import { signInAnonymously } from 'firebase/auth';

/**
 * A non-blocking hook to ensure a user is signed in.
 * If no user is signed in, it will attempt to sign them in anonymously.
 * This is useful for demos and features that need a UID without a full login flow.
 */
export function useEnsureAnonymousUser() {
  const auth = useAuth();
  const { user, loading } = useUser();

  useEffect(() => {
    if (!loading && !user && auth) {
      signInAnonymously(auth).catch((error) => {
        console.error("Anonymous sign-in failed:", error);
      });
    }
  }, [auth, user, loading]);
}
