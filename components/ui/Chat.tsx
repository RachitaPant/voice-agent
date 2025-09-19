'use client';

import { useEffect, useRef, useState } from 'react';
import ChatBox from './Chatbox';

type Message = {
  sender: string;
  text: string;
  audio?: string;
  loading?: boolean;
  avatarUrl?: string;
  source?: 'websocket' | 'voice' | 'user';
};
interface HomeProps {
  onStartCall?: () => void;
  disabled: boolean;
}
export default function Home({ onStartCall, disabled }: HomeProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectAttempts = useRef<number>(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000;

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';
  const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE || 'ws://127.0.0.1:8000';

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll after messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize WebSocket with reconnection logic
  const connectWebSocket = () => {
    wsRef.current = new WebSocket(`${WS_BASE}/ws/chat`);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      reconnectAttempts.current = 0;
    };

    wsRef.current.onmessage = (event) => {
      console.log('Raw WebSocket message:', event.data);
      let data;
      try {
        data = JSON.parse(event.data);
        console.log('Parsed WebSocket data:', data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err, event.data);
        return;
      }

      if (data.error) {
        console.error('WebSocket error:', data.error);
        setMessages((prev) => {
          const updated = [...prev];
          if (
            updated.length > 0 &&
            updated[updated.length - 1]?.loading &&
            updated[updated.length - 1]?.source === 'websocket'
          ) {
            updated[updated.length - 1] = {
              sender: 'Bot',
              text: 'Error: ' + data.error,
              loading: false,
              source: 'websocket',
            };
          }
          return updated;
        });
        return;
      }

      if (data.event === 'processing') {
        console.log('Bot is processing:', data.question);
        return;
      }

      if (data.event === 'partial_text') {
        console.log('Received partial_text:', data.text);
        setMessages((prev) => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];

          if (lastMessage?.loading && lastMessage?.source === 'websocket') {
            // Update existing loading message
            updated[updated.length - 1] = {
              ...lastMessage,
              text: lastMessage.text + data.text,
              loading: true,
            };
          } else {
            // Create new loading message
            updated.push({
              sender: 'Bot',
              text: data.text,
              loading: true,
              source: 'websocket',
            });
          }
          console.log('State updated with partial_text:', updated[updated.length - 1].text);
          return updated;
        });
        return;
      }

      if (data.event === 'done') {
        console.log('Received done:', data.answer, 'audio_url:', data.audio_url);
        const audioUrl = data.audio_url?.startsWith('http')
          ? data.audio_url
          : data.audio_url
            ? `${API_BASE}${data.audio_url}`
            : undefined;

        setMessages((prev) => {
          const updated = [...prev];
          const lastMessage = updated[updated.length - 1];

          if (lastMessage?.loading && lastMessage?.source === 'websocket') {
            // Update existing loading message
            updated[updated.length - 1] = {
              sender: 'Bot',
              text: data.answer || "I couldn't generate an answer.",
              audio: audioUrl,
              loading: false,
              source: 'websocket',
            };
          } else {
            // Create new message if no loading message exists
            updated.push({
              sender: 'Bot',
              text: data.answer || "I couldn't generate an answer.",
              audio: audioUrl,
              loading: false,
              source: 'websocket',
            });
          }
          console.log('State updated with done:', updated[updated.length - 1].text);
          return updated;
        });
        return;
      }

      if (data.event === 'audio_ready') {
        console.log('Received audio_ready:', data.audio_url);
        const audioUrl = data.audio_url?.startsWith('http')
          ? data.audio_url
          : data.audio_url
            ? `${API_BASE}${data.audio_url}`
            : undefined;

        setMessages((prev) => {
          const updated = [...prev];
          // Find the last websocket bot message without loading
          for (let i = updated.length - 1; i >= 0; i--) {
            if (
              updated[i].sender === 'Bot' &&
              !updated[i].loading &&
              updated[i].source === 'websocket'
            ) {
              updated[i] = { ...updated[i], audio: audioUrl };
              break;
            }
          }
          console.log('State updated with audio_ready:', audioUrl);
          return updated;
        });
        return;
      }

      if (data.event === 'audio_error') {
        console.error('TTS error:', data.message);
        setMessages((prev) => {
          const updated = [...prev];
          if (
            updated.length > 0 &&
            updated[updated.length - 1]?.loading &&
            updated[updated.length - 1]?.source === 'websocket'
          ) {
            updated[updated.length - 1] = {
              sender: 'Bot',
              text: 'Error generating audio: ' + data.message,
              loading: false,
              source: 'websocket',
            };
          }
          console.log('State updated with audio_error:', data.message);
          return updated;
        });
        return;
      }

      console.warn('Unhandled WebSocket event:', data.event);
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      if (reconnectAttempts.current < maxReconnectAttempts) {
        console.log(
          `Attempting to reconnect (${reconnectAttempts.current + 1}/${maxReconnectAttempts})...`
        );
        setTimeout(() => {
          reconnectAttempts.current += 1;
          connectWebSocket();
        }, reconnectDelay);
      } else {
        console.error('Max reconnect attempts reached. Please refresh the page.');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'Bot',
            text: 'WebSocket connection lost. Please refresh the page.',
            loading: false,
            source: 'websocket',
          },
        ]);
      }
    };

    wsRef.current.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  };

  // Start session and initialize WebSocket on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const stored = localStorage.getItem('chat_session');
        let session = stored;

        if (!stored) {
          const res = await fetch(`${API_BASE}/start-session`);
          const data = await res.json();
          session = data.session_id;
          if (session !== null) {
            localStorage.setItem('chat_session', session);
          }
        }

        setSessionId(session);

        // Load chat history
        const res = await fetch(`${API_BASE}/history/${session}`);
        const data = await res.json();
        if (data?.history) {
          const pastMessages: Message[] = [];
          data.history.forEach((h: { question: string; answer: string }) => {
            if (h.question)
              pastMessages.push({
                sender: 'You',
                text: h.question,
                source: 'user',
              });
            if (h.answer)
              pastMessages.push({
                sender: 'Bot',
                text: h.answer,
                source: 'websocket',
              });
          });
          setMessages(pastMessages);
        }

        // Initialize WebSocket
        connectWebSocket();
      } catch (err) {
        console.error('Error initializing session:', err);
      } finally {
        setLoadingSession(false);
      }
    };

    initSession();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Send message over WebSocket
  const sendMessage = (text: string) => {
    if (!sessionId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected yet.');
      setMessages((prev) => [
        ...prev,
        {
          sender: 'Bot',
          text: 'Connection lost. Please try again.',
          loading: false,
          source: 'websocket',
        },
      ]);
      return;
    }

    console.log('Sending message:', { session_id: sessionId, question: text });

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        sender: 'You',
        text,
        source: 'user',
      },
    ]);

    // Add loading bot message
    setMessages((prev) => [
      ...prev,
      {
        sender: 'Bot',
        text: '',
        loading: true,
        source: 'websocket',
      },
    ]);

    wsRef.current.send(
      JSON.stringify({
        session_id: sessionId,
        question: text,
      })
    );
  };

  return (
    <div className="bg-background flex min-h-screen w-full flex-col items-center justify-center text-white">
      <ChatBox
        messages={messages}
        setMessages={setMessages}
        onSend={sendMessage}
        loadingSession={loadingSession}
        onStartCall={onStartCall}
        disabled={disabled}
      />
      <div ref={messagesEndRef} />
    </div>
  );
}
