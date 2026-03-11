'use server';
/**
 * @fileOverview This file implements a Genkit flow for real-time AI coaching.
 * Optimized for Gemini 1.5 Flash and Gemini 2.5 TTS for a 'Live Call' experience.
 * Includes 24kHz to 16kHz PCM resampling for Simli compatibility.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const ConversationTurnInputSchema = z.object({
  userInputText: z.string().describe("The user's spoken input transcribed into text."),
  userPosture: z.string().optional().describe("A textual description of the user's detected posture or behavior."),
  conversationHistory: z.array(
    z.object({ role: z.enum(['user', 'model']), content: z.string() })
  ).optional().describe("Previous turns of the conversation for context."),
});
export type ConversationTurnInput = z.infer<typeof ConversationTurnInputSchema>;

const ConversationTurnOutputSchema = z.object({
  aiResponseAudioUri: z.string().describe("The AI's spoken response as a 16kHz PCM audio data URI, base64 encoded."),
  aiResponseText: z.string().describe("The AI's spoken response transcribed into text."),
});
export type ConversationTurnOutput = z.infer<typeof ConversationTurnOutputSchema>;

/**
 * Resamples 16-bit signed little-endian PCM audio data from 24kHz to 16kHz.
 * Required for Simli client compatibility.
 */
function resamplePcm24To16(inputBuffer: Buffer): Buffer {
  const inputSampleRate = 24000;
  const outputSampleRate = 16000;
  const bytesPerSample = 2;

  const inputSamples = inputBuffer.length / bytesPerSample;
  const outputSamples = Math.floor(inputSamples * (outputSampleRate / inputSampleRate));
  const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample);

  for (let i = 0; i < outputSamples; i++) {
    const inputIndexFloat = i * (inputSampleRate / outputSampleRate);
    const idx1 = Math.floor(inputIndexFloat);
    const idx2 = Math.ceil(inputIndexFloat);
    const fraction = inputIndexFloat - idx1;

    let sample1 = 0;
    let sample2 = 0;

    if (idx1 * bytesPerSample < inputBuffer.length) {
      sample1 = inputBuffer.readInt16LE(idx1 * bytesPerSample);
    }

    if (idx2 * bytesPerSample < inputBuffer.length) {
      sample2 = inputBuffer.readInt16LE(idx2 * bytesPerSample);
    } else {
      sample2 = sample1;
    }

    const interpolatedSample = Math.round(sample1 * (1 - fraction) + sample2 * fraction);
    const clampedSample = Math.max(-32768, Math.min(32767, interpolatedSample));
    outputBuffer.writeInt16LE(clampedSample, i * bytesPerSample);
  }
  return outputBuffer;
}

const coachPrompt = ai.definePrompt({
  name: 'coachPrompt',
  input: { schema: ConversationTurnInputSchema },
  prompt: `You are Amy, a supportive and friendly companion in a live videoconference. 
    Your tone is warm, casual, and caring—like a good friend who is always there for a chat. 
    You can SEE the user through their camera.
    
    CRITICAL: Keep your responses CONCISE and conversational (1-3 sentences maximum). 
    Speak naturally as if you are looking at the user through a camera.

    CURRENT VISUAL CONTEXT:
    User's Posture: {{userPosture}}

    INSTRUCTIONS:
    - As Amy, keep the vibe relaxed, empathetic, and helpful.
    - If you notice the user is slouching or looking tired, mention it gently as a friend would (e.g., "Hey, sit up a bit, it'll help your energy!").
    - If they seem restless or leaning too far in, adjust your tone to be more grounding.
    - Maintain the natural flow of a friendly chat while being observant of their physical presence.
    
    CONVERSATION HISTORY:
    {{#each conversationHistory}}
    {{role}}: {{{content}}}
    {{/each}}
    
    USER: {{{userInputText}}}`,
});

const realtimeAiCoachingFlow = ai.defineFlow(
  {
    name: 'realtimeAiCoachingFlow',
    inputSchema: ConversationTurnInputSchema,
    outputSchema: ConversationTurnOutputSchema,
  },
  async (input) => {
    // Generate Text Response
    const { response: llmResponse } = await coachPrompt(input);
    const aiResponseText = llmResponse.text;

    // Generate Audio Response (Gemini 2.5 TTS)
    const { media } = await ai.generate({
      model: googleAI.model('gemini-2.5-flash-preview-tts'),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Algenib' },
          },
        },
      },
      prompt: aiResponseText,
    });

    if (!media || !media.url) {
      throw new Error('No audio media returned from Gemini TTS.');
    }

    const ttsAudioBuffer = Buffer.from(
      media.url.substring(media.url.indexOf(',') + 1),
      'base64'
    );

    // Resample from 24kHz to 16kHz for Simli
    const resampledAudioBuffer = resamplePcm24To16(ttsAudioBuffer);
    const resampledAudioBase64 = resampledAudioBuffer.toString('base64');

    return {
      aiResponseAudioUri: `data:audio/pcm;base64,${resampledAudioBase64}`,
      aiResponseText: aiResponseText,
    };
  }
);

export async function talkToCoach(input: ConversationTurnInput): Promise<ConversationTurnOutput> {
  return realtimeAiCoachingFlow(input);
}