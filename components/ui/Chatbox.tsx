'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

type Message = {
  sender: string;
  text: string;
  audio?: string;
  loading?: boolean;
  avatarUrl?: string;
  source?: 'websocket' | 'voice' | 'user';
};

interface ChatBoxProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onSend: (message: string) => void;
  loadingSession?: boolean;
  onStartCall?: () => void;
  disabled: boolean;
}

export default function ChatBox({
  messages,
  setMessages,
  onSend,
  loadingSession,
  onStartCall,
  disabled,
}: ChatBoxProps) {
  // State
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';
  const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://your-project.livekit.cloud';

  const [livekitToken, setLivekitToken] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [roomName] = useState('lexcapital-room');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState<number | null>(null);
  const [sttError, setSttError] = useState<string | null>(null);
  const [lastVoiceTranscriptionId, setLastVoiceTranscriptionId] = useState<string | null>(null);
  const lastPlayedAudioRef = useRef<string | null>(null);

  const botIsTyping = !!(
    messages.length &&
    messages[messages.length - 1].loading &&
    messages[messages.length - 1].source !== 'voice'
  );

  // Refs
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const voiceModeRef = useRef(voiceMode);

  // Hooks
  const { transcript, listening, resetTranscript, browserSupportsSpeechRecognition } =
    useSpeechRecognition();

  // Update ref when voiceMode changes
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // Memoized handlers

  const toggleAudio = useCallback(
    (url: string) => {
      if (currentAudio) {
        currentAudio.pause();
        setIsPlaying(null);
        setCurrentAudio(null);
        if (isPlaying === url) return;
      }
      const audio = new Audio(url);
      setCurrentAudio(audio);
      setIsPlaying(url);
      audio.play().catch((err) => console.error('Audio playback failed:', err));
      audio.onended = () => {
        setIsPlaying(null);
        setCurrentAudio(null);
      };
    },
    [currentAudio, isPlaying]
  );

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(index);
      setTimeout(() => setCopiedMsg(null), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const fetchLivekitToken = useCallback(async () => {
    try {
      console.log('Fetching token from:', `${API_BASE}/livekit/token`);
      const res = await fetch(`${API_BASE}/livekit/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_name: roomName,
          participant_name: 'user',
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
      }

      const data = await res.json();
      if (data.token) {
        setLivekitToken(data.token);
        console.log('Token fetched successfully');
        setVoiceMode(true);
      } else {
        console.error('Token fetch failed, no token in response:', data);
        setConnectionError('Failed to fetch LiveKit token: No token in response.');
      }
    } catch (err) {
      console.error('Error fetching LiveKit token:', err);
      setConnectionError(`Failed to connect to voice assistant: ${(err as Error).message}`);
    }
  }, [API_BASE, roomName, livekitToken]);

  const handleSend = useCallback(() => {
    if (!input.trim() || loadingSession || voiceMode) return;
    if (listening) {
      SpeechRecognition.stopListening();
    }
    onSend(input);
    setInput('');
    resetTranscript();
  }, [input, loadingSession, voiceMode, listening, onSend, resetTranscript]);

  const toggleVoiceMode = useCallback(async () => {
    if (voiceMode) {
      setVoiceMode(false);
      setLivekitToken('');
      SpeechRecognition.stopListening();
      if (currentAudio) {
        currentAudio.pause();
        setIsPlaying(null);
        setCurrentAudio(null);
      }
    } else {
      await fetchLivekitToken();
    }
  }, [voiceMode, currentAudio, fetchLivekitToken]);

  // Auto-scroll and audio handling
  // Add a ref to track the last played audio URL

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!voiceMode) {
      const lastMsg = messages[messages.length - 1];
      if (
        lastMsg?.audio &&
        !lastMsg.loading &&
        lastMsg.source === 'websocket' &&
        lastPlayedAudioRef.current !== lastMsg.audio // Prevent replaying the same audio
      ) {
        lastPlayedAudioRef.current = lastMsg.audio;
        toggleAudio(lastMsg.audio);
      }
    }
  }, [messages, voiceMode, toggleAudio]);

  // Handle speech recognition transcript
  useEffect(() => {
    if (transcript && listening && !voiceMode) {
      setInput(transcript);
    }
  }, [transcript, listening, voiceMode]);

  // Check speech recognition support
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setSttError('Speech recognition not supported in this browser.');
    }
  }, [browserSupportsSpeechRecognition]);

  // Filter messages based on mode
  const filteredMessages = voiceMode ? messages : messages.filter((msg) => msg.source !== 'voice');

  // Configuration check
  if (!API_BASE || !LIVEKIT_URL) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-neutral-900 text-gray-200">
        <p className="text-red-400">Configuration error: API_BASE or LIVEKIT_URL is missing.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-neutral-900 text-gray-200">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 text-center text-sm text-gray-400"></div>

      <div className="scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-900 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loadingSession ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex space-x-2">
              <div className="h-3 w-3 animate-bounce rounded-full bg-blue-500"></div>
              <div className="h-3 w-3 animate-bounce rounded-full bg-blue-400 delay-150"></div>
              <div className="h-3 w-3 animate-bounce rounded-full bg-blue-300 delay-300"></div>
            </div>
          </div>
        ) : (
          filteredMessages.map((msg, i) => {
            const isUser = msg.sender === 'You';
            const isVoiceMessage = msg.source === 'voice';

            return (
              <motion.div
                key={`${i}-${msg.source}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
                className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <Image
                    src={msg.avatarUrl || '/bot.png'}
                    alt="bot"
                    width={24}
                    height={24}
                    className={`rounded-full border p-1 ${
                      isVoiceMessage ? 'border-green-500' : 'border-neutral-700'
                    }`}
                  />
                )}
                <div
                  className={`group relative max-w-xs rounded-xl px-3 py-2 text-sm leading-snug ${
                    isUser
                      ? 'bg-blue-700 text-white'
                      : isVoiceMessage
                        ? 'bg-green-800 text-gray-200'
                        : 'bg-neutral-800 text-gray-200'
                  }`}
                >
                  {msg.loading ? (
                    <div className="flex flex-col">
                      <div className="mb-1 flex space-x-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-600"></span>
                        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-600 delay-150"></span>
                        <span className="h-2 w-2 animate-bounce rounded-full bg-gray-600 delay-300"></span>
                      </div>
                      <p>{msg.text}</p>
                    </div>
                  ) : (
                    <p>{msg.text}</p>
                  )}

                  {msg.audio && !msg.loading && !voiceMode && msg.source === 'websocket' && (
                    <button
                      onClick={() => toggleAudio(msg.audio!)}
                      className="absolute right-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 p-2 text-xs transition hover:bg-blue-500"
                      title={isPlaying === msg.audio ? 'Pause audio' : 'Play audio'}
                    >
                      {isPlaying === msg.audio ? '⏸' : '▶'}
                    </button>
                  )}

                  {!msg.loading && (
                    <button
                      onClick={() => copyToClipboard(msg.text, i)}
                      className="absolute top-1 right-1 rounded bg-neutral-700 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100 hover:bg-neutral-600"
                    >
                      {copiedMsg === i ? '✓' : '📋'}
                    </button>
                  )}
                </div>
                {isUser && (
                  <Image
                    src={msg.avatarUrl || '/user.png'}
                    alt="you"
                    width={24}
                    height={24}
                    className="rounded-full border border-blue-600 p-1"
                  />
                )}
              </motion.div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-800 bg-neutral-900 px-4 py-3">
        {/* Input box */}
        <input
          type="text"
          className={`flex-grow rounded-full border border-neutral-700 bg-neutral-800 px-4 py-2 text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 ${
            voiceMode ? 'cursor-not-allowed' : ''
          }`}
          value={input}
          disabled={loadingSession || voiceMode}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          onKeyDown={(e) => e.key === 'Enter' && !voiceMode && handleSend()}
        />

        {/* Voice button */}
        <Button
          variant="primary"
          size="lg"
          onClick={onStartCall}
          className="shrink-0 rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          Voice
        </Button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={loadingSession || !input.trim() || voiceMode}
          className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
