'use client';

import styles from '../page.module.css';

interface DeadOverlayProps {
    isAlive: boolean;
}

/**
 * Semi-transparent overlay shown to eliminated players.
 * Indicates they are now spectating the rest of the game.
 */
export function DeadOverlay({ isAlive }: DeadOverlayProps) {
    if (isAlive) return null;

    return (
        <div className={styles.deadOverlay}>
            <div className={styles.deadContent}>
                <span className={styles.deadIcon}>💀</span>
                <h2>You were eliminated!</h2>
                <p>Spectating...</p>
            </div>
        </div>
    );
}
