'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Two voices, deliberately different (frontend/README.md): the transcript is
 * read flat and fast, like a screen reader; the agent's own words are read in a
 * second, warmer voice. Collapsing them into one voice loses the demo's beat.
 */
export type VoiceKind = 'reader' | 'agent';

const MAX_BACKLOG = 6;

function pickVoices(): { reader: SpeechSynthesisVoice | null; agent: SpeechSynthesisVoice | null } {
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const byName = (pattern: RegExp) => voices.find((voice) => pattern.test(voice.name));
  const reader = byName(/UK English Male|David|Daniel|Guy|George/i) ?? voices[0] ?? null;
  const agent = byName(/US English$|Aria|Jenny|Samantha|Zira|Female|Libby|Sonia/i) ?? voices.find((voice) => voice !== reader) ?? reader;
  return { reader, agent };
}

export function useSpeech(initiallyEnabled: boolean) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const voices = useRef<ReturnType<typeof pickVoices>>({ reader: null, agent: null });
  const backlog = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);
    const load = () => (voices.current = pickVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!enabled && supported) {
      window.speechSynthesis.cancel();
      backlog.current = 0;
    }
  }, [enabled, supported]);

  const speak = useCallback(
    (text: string, kind: VoiceKind) => {
      if (!enabled || !supported || !text.trim()) return;
      // Stay near live: if speech has fallen far behind the run, drop the backlog.
      if (backlog.current >= MAX_BACKLOG) {
        window.speechSynthesis.cancel();
        backlog.current = 0;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voices.current[kind];
      if (voice) utterance.voice = voice;
      utterance.rate = kind === 'reader' ? 1.2 : 1.0;
      utterance.pitch = kind === 'reader' ? 0.8 : 1.05;
      backlog.current++;
      const done = () => (backlog.current = Math.max(0, backlog.current - 1));
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    },
    [enabled, supported],
  );

  return { supported, enabled, setEnabled, speak };
}
