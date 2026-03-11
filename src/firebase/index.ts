'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from '@/firebase/config';

/**
 * Initializes Firebase services with a defensive multi-stage fallback.
 * 
 * 1. Checks for existing initialization to avoid 'duplicate app' errors.
 * 2. Attempts automatic initialization (standard for Firebase App Hosting).
 * 3. Falls back to explicit firebaseConfig for local dev or misconfigured environments.
 */
export function initializeFirebase() {
  // Return existing app if already initialized
  const apps = getApps();
  if (apps.length > 0) {
    return getSdks(getApp());
  }

  let app: FirebaseApp;

  try {
    // Stage 1: Attempt automatic initialization (No arguments)
    // This is the preferred method for Firebase App Hosting
    app = initializeApp();
  } catch (autoInitError: any) {
    // Stage 2: Fallback to manual configuration
    // We catch 'no-options' errors and other initialization failures
    try {
      app = initializeApp(firebaseConfig);
    } catch (manualInitError: any) {
      // Final Fallback: If everything fails, try to return the default app if it somehow exists
      if (getApps().length > 0) {
        app = getApp();
      } else {
        // Log the failure to help debugging in the cloud console
        console.error('CRITICAL: Firebase failed to initialize with all methods.', manualInitError);
        throw manualInitError;
      }
    }
  }

  return getSdks(app);
}

export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp)
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
