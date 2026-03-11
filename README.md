# AI Coach Connect

Experience the future of personal development with **AI Coach Connect**, a real-time AI coaching platform. This application features a photorealistic AI avatar that can see you, hear you, and provide immediate feedback on your posture and performance.

## Key Features

- **Gemini Live Experience**: Ultra-low latency voice and video interactions powered by Gemini 2.5 Flash.
- **Visual Intelligence**: Integrated MediaPipe Pose detection allows the coach to analyze your posture and behavior in real-time.
- **Photorealistic Avatar**: Powered by Simli for a seamless, "videoconference" style coaching call.
- **Session History & Summarization**: All sessions are saved to Firebase Firestore, with AI-generated summaries for every interaction.
- **Secure Authentication**: Google Sign-In via Firebase Authentication.

## Getting Started

### Prerequisites

1.  **Firebase Project**: Ensure you have a Firebase project set up with Authentication and Firestore enabled.
2.  **API Keys**: You will need the following keys in your `.env` file:
    - `SIMLI_API_KEY`: Your Simli API key for avatar streaming.
    - `GOOGLE_GENAI_API_KEY`: Your Google AI Studio key for Gemini.

### Installation

```bash
npm install
```

### Running Locally

```bash
# Start the Next.js development server
npm run dev

# In a separate terminal, start Genkit for AI flows
npm run genkit:dev
```

## Deployment

This app is configured for **Firebase App Hosting**. 

1.  Push your code to a GitHub repository.
2.  Connect the repository to Firebase App Hosting in the [Firebase Console](https://console.firebase.google.com/).
3.  Configure your environment variables (`SIMLI_API_KEY`, `GOOGLE_GENAI_API_KEY`) in the App Hosting settings.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **AI**: Genkit, Gemini 1.5 Flash, Gemini 2.5 TTS
- **Backend**: Firebase (Auth, Firestore)
- **Real-time Video**: Simli
- **Computer Vision**: MediaPipe Pose
- **UI**: Tailwind CSS, ShadCN UI, Lucide Icons
# getavox-app
