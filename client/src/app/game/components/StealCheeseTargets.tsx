'use client';

import type { Player } from '@in-vino-morte/shared';
import { AVATARS } from '../constants';
import styles from '../page.module.css';

interface StealCheeseTargetsProps {
    validCheeseTargets: Player[];
    onStealCheese: (seat: number) => void;
    onCancel: () => void;
}

/**
 * Target selection overlay for stealing cheese (Caseus Vitae expansion).
 */
export function StealCheeseTargets({
    validCheeseTargets,
    onStealCheese,
    onCancel,
}: StealCheeseTargetsProps) {
    return (
        <div className={styles.targetSelection}>
            <p>Select a player to steal cheese from:</p>
            <div className={styles.targetList}>
                {validCheeseTargets.map(player => (
                    <button
                        key={player.id}
                        className={styles.targetButton}
                        onClick={() => onStealCheese(player.seat)}
                    >
                        {AVATARS[player.avatarId]} {player.name} {'\uD83E\uDDC0'}
                    </button>
                ))}
            </div>
            <button className={styles.cancelButton} onClick={onCancel}>
                Cancel
            </button>
        </div>
    );
}
