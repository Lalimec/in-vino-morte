'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useGameStore } from '@/stores/gameStore';
import WineBackground from '@/components/WineBackground';
import { getApiUrl } from '@/lib/config';
import { hideSplashScreen } from '@/lib/capacitor';

// Avatar emojis for selection
// Avatars - wine glass excluded (used for game cards)
const AVATARS = ['🍸', '🥂', '🍹', '🍺', '🥃', '🧉', '☕', '🍵', '🫖', '🍾', '🍻', '🥤', '🧃', '🫗', '🍶'];

// Get or create a persistent session ID for this browser
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sessionId = localStorage.getItem('sessionId');
  if (!sessionId) {
    // Fallback for environments where crypto.randomUUID() is not available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      // Simple UUID v4 fallback
      sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    localStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [avatarId, setAvatarId] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setPlayerInfo, setToken, setRoomInfo } = useGameStore();

  // Load saved name from localStorage on mount and hide splash screen
  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    const savedAvatarId = localStorage.getItem('avatarId');
    if (savedName) setPlayerName(savedName);
    if (savedAvatarId) setAvatarId(parseInt(savedAvatarId));

    // Hide splash screen once the app is ready (mobile only)
    hideSplashScreen();
  }, []);

  // Update name (save to localStorage on blur to avoid lag)
  const handleNameChange = (name: string) => {
    setPlayerName(name);
  };

  // Save name to localStorage when input loses focus
  const handleNameBlur = () => {
    if (typeof window !== 'undefined' && playerName.trim()) {
      localStorage.setItem('playerName', playerName.trim());
    }
  };

  // Save avatar to localStorage when it changes
  const handleAvatarChange = (id: number) => {
    setAvatarId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('avatarId', id.toString());
    }
  };

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    // Save name to localStorage before submitting
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerName', playerName.trim());
    }

    setIsLoading(true);
    setError(null);

    const sessionId = getSessionId();
    const payload = { hostName: playerName.trim(), avatarId, sessionId };

    console.log('[CREATE] API URL:', getApiUrl());
    console.log('[CREATE] Payload:', payload);
    console.log('[CREATE] SessionId valid UUID?', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId));

    try {
      const res = await fetch(`${getApiUrl()}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('[CREATE] Error response:', data);
        throw new Error(data.error || 'Failed to create room');
      }

      const data = await res.json();

      setPlayerInfo(playerName.trim(), avatarId);
      setToken(data.token);
      setRoomInfo(data.roomId, data.joinCode);

      router.push('/lobby');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!joinCode.trim() || joinCode.trim().length !== 6) {
      setError('Please enter a valid 6-character room code');
      return;
    }

    // Save name to localStorage before submitting
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerName', playerName.trim());
    }

    setIsLoading(true);
    setError(null);

    const normalizedCode = joinCode.trim().toUpperCase();
    const sessionId = getSessionId();
    const payload = {
      joinCode: normalizedCode,
      name: playerName.trim(),
      avatarId,
      sessionId,
    };

    console.log('[JOIN] API URL:', getApiUrl());
    console.log('[JOIN] Payload:', payload);
    console.log('[JOIN] SessionId valid UUID?', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId));

    try {
      const res = await fetch(`${getApiUrl()}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('[JOIN] Error response:', data);
        const errorMessages: Record<string, string> = {
          'NAME_TAKEN': 'That name is already taken in this room',
          'ROOM_NOT_FOUND': 'Room not found. Check the code and try again',
          'ROOM_FULL': 'This room is full',
          'GAME_IN_PROGRESS': 'Game already started in this room',
          'SESSION_ALREADY_IN_ROOM': 'You are already in this room (check other tabs)',
          'INVALID_REQUEST': 'Invalid request - check console for details',
        };
        throw new Error(errorMessages[data.error] || data.error || 'Failed to join room');
      }

      const data = await res.json();

      setPlayerInfo(playerName.trim(), avatarId);
      setToken(data.token);
      setRoomInfo(data.roomId, normalizedCode);

      router.push('/lobby');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <WineBackground>
      <main className={styles.main}>
        {/* Back button - fixed to corner */}
        {mode !== 'menu' && (
          <button
            className={styles.backButton}
            onClick={() => { setMode('menu'); setError(null); }}
          >
            ← Back
          </button>
        )}

        <div className={styles.container}>
          {/* Logo */}
          <div className={styles.logoSection}>
            <div className={styles.logo}>
              <span className={styles.logoWine}>🍷</span>
              <span className={styles.logoSkull}>💀</span>
            </div>
            <h1 className={styles.title}>In Vino Morte</h1>
            <p className={styles.subtitle}>Drink or Swap. Survive the Poison.</p>
          </div>

          {mode === 'menu' && (
            <>
              <div className={styles.menu}>
                <button
                  className={styles.primaryButton}
                  onClick={() => setMode('create')}
                >
                  Create Room
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setMode('join')}
                >
                  Join Room
                </button>
              </div>

              <div className={styles.gameInfo}>
                <p className={styles.gameDescription}>
                  A social deduction game of table-reading and imminent doom. Each round,
                  players receive a glass of wine that may be poisoned. Drink yours or swap
                  with another player, just try to survive!
                </p>
                <a
                  href="https://boardgamegeek.com/boardgame/212404/in-vino-morte"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.bggLink}
                >
                  Based on the card game by Button Shy Games
                </a>
              </div>
            </>
          )}

          {(mode === 'create' || mode === 'join') && (
            <div className={styles.form}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Your Name</label>
                <input
                  type="text"
                  className={styles.input}
                  value={playerName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onBlur={handleNameBlur}
                  placeholder="Enter your name"
                  maxLength={20}
                  autoComplete="off"
                />
              </div>

              {mode === 'join' && (
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Room Code</label>
                  <input
                    type="text"
                    className={styles.codeInput}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="ABCDEF"
                    maxLength={6}
                    autoComplete="off"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              )}

              <div className={styles.inputGroup}>
                <label className={styles.label}>Choose Avatar</label>
                <div className={styles.avatarGrid}>
                  {AVATARS.map((avatar, index) => (
                    <button
                      key={index}
                      className={`${styles.avatarButton} ${avatarId === index ? styles.avatarSelected : ''}`}
                      onClick={() => handleAvatarChange(index)}
                      type="button"
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className={styles.error}>{error}</div>
              )}

              <button
                className={styles.primaryButton}
                onClick={mode === 'create' ? handleCreateRoom : handleJoinRoom}
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : (mode === 'create' ? 'Create Room' : 'Join Room')}
              </button>
            </div>
          )}

        </div>
      </main>
    </WineBackground>
  );
}

