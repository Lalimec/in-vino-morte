'use client';

import styles from '../page.module.css';

interface ExitModalProps {
    showExitModal: boolean;
    onClose: () => void;
    onExit: () => void;
}

/**
 * Confirmation modal shown when the player clicks the exit button.
 * Asks for confirmation before leaving the game.
 */
export function ExitModal({ showExitModal, onClose, onExit }: ExitModalProps) {
    if (!showExitModal) return null;

    return (
        <div className={styles.exitModal}>
            <div className={styles.exitModalContent}>
                <h2>Leave Game?</h2>
                <p>You will be removed from this game and returned to the main menu.</p>
                <div className={styles.exitModalButtons}>
                    <button onClick={onClose}>
                        Stay
                    </button>
                    <button onClick={onExit}>
                        Leave
                    </button>
                </div>
            </div>
        </div>
    );
}
