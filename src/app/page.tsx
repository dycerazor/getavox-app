import dynamic from 'next/dynamic';
import { BrainCircuit, ShieldCheck, Zap, Sparkles } from 'lucide-react';
import { AuthButton } from '@/components/auth/AuthButton';

// Dynamic import for client-only component that uses browser APIs (simli-client)
const MascotCoach = dynamic(
  () => import('@/components/coach/MascotCoach').then((mod) => mod.MascotCoach),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full max-w-4xl aspect-video bg-slate-900 rounded-2xl flex items-center justify-center border-4 border-white/10 shadow-2xl">
        <div className="flex flex-col items-center gap-4">
          <BrainCircuit className="w-12 h-12 text-accent animate-pulse" />
          <p className="text-slate-400 font-medium">Loading AI Coach...</p>
        </div>
      </div>
    )
  }
);

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center">
      {/* Header */}
      <header className="w-full py-6 px-8 border-b bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg">
              <BrainCircuit className="text-white w-6 h-6" />
            </div>
            <h1 className="text-2xl font-headline font-bold tracking-tight text-primary">
              AI Coach<span className="text-accent">Connect</span>
            </h1>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#" className="hover:text-primary transition-colors">How it works</a>
            <a href="#" className="hover:text-primary transition-colors">Pricing</a>
            <a href="#" className="hover:text-primary transition-colors">Resources</a>
            <div className="h-4 w-[1px] bg-slate-200"></div>
            <AuthButton />
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 px-6 w-full max-w-7xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-headline font-extrabold text-slate-900 mb-4 tracking-tight">
          Unlock Your Potential with <span className="text-primary italic">Real-Time</span> AI Coaching
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-12">
          Experience the future of personal development. Engage with your photorealistic AI avatar 
          powered by Gemini for personalized, immediate feedback on your performance.
        </p>
        
        {/* Main Interface - Dynamically Loaded */}
        <MascotCoach />
      </section>

      {/* Features Grid */}
      <section className="bg-white w-full py-20 px-6 border-t mt-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-headline font-bold mb-3">Privacy First</h3>
              <p className="text-slate-500 leading-relaxed">
                Your sessions are private and secure. We use end-to-end encryption for all real-time interactions.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center mb-6">
                <Zap className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-headline font-bold mb-3">Ultra Low Latency</h3>
              <p className="text-slate-500 leading-relaxed">
                Experience seamless conversation with sub-second response times thanks to Simli and Gemini optimization.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-headline font-bold mb-3">Tailored Experience</h3>
              <p className="text-slate-500 leading-relaxed">
                The AI coach learns your goals and style over time, providing increasingly relevant guidance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-12 px-8 bg-slate-900 text-slate-400 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <BrainCircuit className="text-accent w-5 h-5" />
            <span className="font-headline font-bold text-white text-lg">AI Coach Connect</span>
          </div>
          <div className="flex gap-8 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Contact Support</a>
          </div>
          <div className="text-sm">
            © {new Date().getFullYear()} AI Coach Connect. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
