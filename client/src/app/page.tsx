'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useGameStore } from '@/stores/gameStore';
import WineBackground from '@/components/WineBackground';

// Get API URL at runtime based on current hostname
function getApiUrl(): string {
  if (typeof window === 'undefined') return '';
  // Development: use localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  // Production: use relative URLs (IIS proxies to Node server)
  return '';
}

// Avatar emojis for selection
// Avatars - wine glass excluded (used for game cards)
const AVATARS = ['🍸', '🥂', '🍹', '🍺', '🥃', '🧉', '☕', '🍵', '🫖', '🍾', '🍻', '🥤', '🧃', '🫗', '🍶'];

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [avatarId, setAvatarId] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setPlayerInfo, setToken, setRoomInfo } = useGameStore();

  // Load saved name from localStorage on mount
  useEffect(() => {
    const savedName = localStorage.getItem('playerName');
    const savedAvatarId = localStorage.getItem('avatarId');
    if (savedName) setPlayerName(savedName);
    if (savedAvatarId) setAvatarId(parseInt(savedAvatarId));
  }, []);

  // Save name to localStorage when it changes
  const handleNameChange = (name: string) => {
    setPlayerName(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerName', name);
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

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostName: playerName.trim(), avatarId }),
      });

      if (!res.ok) {
        const data = await res.json();
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

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joinCode: joinCode.trim().toUpperCase(),
          name: playerName.trim(),
          avatarId
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        const errorMessages: Record<string, string> = {
          'NAME_TAKEN': 'That name is already taken in this room',
          'ROOM_NOT_FOUND': 'Room not found. Check the code and try again',
          'ROOM_FULL': 'This room is full',
          'GAME_IN_PROGRESS': 'Game already started in this room',
        };
        throw new Error(errorMessages[data.error] || data.error || 'Failed to join room');
      }

      const data = await res.json();

      setPlayerInfo(playerName.trim(), avatarId);
      setToken(data.token);
      setRoomInfo(data.roomId, joinCode.trim().toUpperCase());

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
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABCDEF"
                    maxLength={6}
                    autoComplete="off"
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

