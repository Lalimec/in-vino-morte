import { v4 as uuidv4 } from 'uuid';
import {
    CardType,
    GamePhase,
    GameState,
    Player,
    RoomSettings,
    RoomState,
    FullState,
} from '@in-vino-morte/shared';
import {
    MIN_PLAYERS,
    MAX_PLAYERS,
    DEFAULT_TURN_TIMER,
    RECONNECT_TIMEOUT,
    DISCONNECTED_TURN_TIMEOUT,
    DEFAULT_CHEESE_COUNT,
    FINAL_REVEAL,
} from '@in-vino-morte/shared';
import { WebSocket } from 'ws';

interface PlayerConnection {
    player: Player;
    ws: WebSocket | null;
    token: string;
    sessionId: string;
    disconnectedAt: number | null;
}

export class Room {
    public readonly id: string;
    public readonly joinCode: string;
    public readonly createdAt: number;

    private hostId: string;
    private settings: RoomSettings;
    private players: Map<string, PlayerConnection> = new Map();
    private seatToPlayerId: Map<number, string> = new Map();
    private status: 'LOBBY' | 'IN_GAME' = 'LOBBY';

    // Game state (only set during game)
    private game: GameState | null = null;
    private cardBySeat: Map<number, CardType> = new Map(); // Server-only secret

    // Voting state (for rematch voting)
    private rematchVotes: Set<number> = new Set(); // Seats that voted yes
    private isVotingPhase: boolean = false;

    // Timers
    private turnTimer: NodeJS.Timeout | null = null;
    private dealerTimer: NodeJS.Timeout | null = null;

    constructor(joinCode: string, hostId: string) {
        this.id = uuidv4();
        this.joinCode = joinCode;
        this.hostId = hostId;
        this.createdAt = Date.now();
        this.settings = {
            turnTimer: DEFAULT_TURN_TIMER,
            cheeseEnabled: false, // Caseus Vitae expansion off by default
            cheeseCount: DEFAULT_CHEESE_COUNT,
        };
    }

    // ==========================================
    // Player Management
    // ==========================================

    public addPlayer(id: string, name: string, avatarId: number, token: string, sessionId: string, ws: WebSocket): { success: boolean; error?: string } {
        if (this.players.size >= MAX_PLAYERS) {
            return { success: false, error: 'ROOM_FULL' };
        }

        if (this.status === 'IN_GAME') {
            return { success: false, error: 'GAME_IN_PROGRESS' };
        }

        // Check for duplicate names (case-insensitive)
        const normalizedName = name.trim().toLowerCase();
        for (const conn of this.players.values()) {
            if (conn.player.name.toLowerCase() === normalizedName) {
                return { success: false, error: 'NAME_TAKEN' };
            }
        }

        // Find next available seat
        const usedSeats = new Set(Array.from(this.players.values()).map(p => p.player.seat));
        let seat = 0;
        while (usedSeats.has(seat)) seat++;

        const player: Player = {
            id,
            name,
            avatarId,
            seat,
            alive: true,
            connected: true,
            ready: false,
            hasCheese: false, // Caseus Vitae
        };

        this.players.set(id, { player, ws, token, sessionId, disconnectedAt: null });
        this.seatToPlayerId.set(seat, id);

        return { success: true };
    }

    public reconnectPlayer(token: string, ws: WebSocket): { success: boolean; playerId?: string; error?: string } {
        for (const [playerId, conn] of this.players) {
            if (conn.token === token) {
                conn.ws = ws;
                conn.player.connected = true;
                conn.disconnectedAt = null;

                // Broadcast reconnection to other players
                this.broadcastExcept(playerId, {
                    op: 'PLAYER_RECONNECTED',
                    seat: conn.player.seat,
                });

                return { success: true, playerId };
            }
        }
        return { success: false, error: 'INVALID_TOKEN' };
    }

    public disconnectPlayer(playerId: string): void {
        const conn = this.players.get(playerId);
        if (!conn) return;

        // In LOBBY: remove player immediately (no reconnect grace period)
        if (this.status === 'LOBBY') {
            const seat = conn.player.seat;
            this.removePlayer(playerId);
            this.broadcast({
                op: 'PLAYER_LEFT',
                seat,
                reason: 'disconnected',
            });
            return;
        }

        // IN_GAME: allow reconnection window
        conn.ws = null;
        conn.player.connected = false;
        conn.disconnectedAt = Date.now();

        // Broadcast that player disconnected (so clients can show status)
        this.broadcast({
            op: 'PLAYER_LEFT',
            seat: conn.player.seat,
            reason: 'disconnected',
        });

        // If in voting phase, update vote status immediately
        if (this.isVotingPhase) {
            this.rematchVotes.delete(conn.player.seat);
            this.broadcastVoteUpdate();
            this.checkVoteResolution();
        }

        // If it's this player's turn, start the auto-drink timer
        if (this.game && this.game.phase === 'TURNS' && this.game.turnSeat === conn.player.seat) {
            this.setTurnDeadline();
        }

        // If they're the dealer during DEALER_SETUP, auto-assign cards
        if (this.game && this.game.phase === 'DEALER_SETUP' && this.game.dealerSeat === conn.player.seat) {
            this.handleDisconnectedDealerSetup();
        }

        // If they're the dealer during AWAITING_REVEAL, auto-trigger reveal
        if (this.game && this.game.phase === 'AWAITING_REVEAL' && this.game.dealerSeat === conn.player.seat) {
            this.startRevealSequence();
        }

        // Schedule timeout check for in-game disconnects
        setTimeout(() => {
            this.checkDisconnectTimeout(playerId);
        }, RECONNECT_TIMEOUT * 1000);
    }

    private checkDisconnectTimeout(playerId: string): void {
        const conn = this.players.get(playerId);
        if (conn && !conn.player.connected && conn.disconnectedAt) {
            const elapsed = Date.now() - conn.disconnectedAt;
            if (elapsed >= RECONNECT_TIMEOUT * 1000) {
                // Player is truly gone
                if (this.status === 'IN_GAME') {
                    // During voting phase, just remove them
                    if (this.isVotingPhase) {
                        this.removePlayer(playerId);
                        this.broadcast({
                            op: 'PLAYER_LEFT',
                            seat: conn.player.seat,
                            reason: 'disconnected',
                        });
                    } else {
                        // Mark as dead in game
                        conn.player.alive = false;
                        this.checkGameEnd();
                    }
                } else {
                    // Remove from lobby
                    this.removePlayer(playerId);
                }
            }
        }
    }

    public removePlayer(playerId: string): void {
        const conn = this.players.get(playerId);
        if (conn) {
            this.seatToPlayerId.delete(conn.player.seat);
            this.players.delete(playerId);

            // If host left, assign new host
            if (playerId === this.hostId && this.players.size > 0) {
                this.hostId = this.players.keys().next().value!;
            }

            this.broadcastLobbyUpdate();
        }
    }

    public setPlayerReady(playerId: string, ready: boolean): void {
        const conn = this.players.get(playerId);
        if (conn) {
            conn.player.ready = ready;
            this.broadcastLobbyUpdate();
        }
    }

    public getPlayerCount(): number {
        return this.players.size;
    }

    public isEmpty(): boolean {
        return this.players.size === 0;
    }

    public isFull(): boolean {
        return this.players.size >= MAX_PLAYERS;
    }

    public isInGame(): boolean {
        return this.status === 'IN_GAME';
    }

    public isNameTaken(name: string): boolean {
        const normalizedName = name.trim().toLowerCase();
        for (const conn of this.players.values()) {
            if (conn.player.name.toLowerCase() === normalizedName) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find an existing player by their sessionId.
     * Returns playerId and token if found.
     */
    public findPlayerBySessionId(sessionId: string): { playerId: string; token: string; connected: boolean } | null {
        for (const [playerId, conn] of this.players) {
            if (conn.sessionId === sessionId) {
                return { playerId, token: conn.token, connected: conn.player.connected };
            }
        }
        return null;
    }

    // ==========================================
    // Game Flow
    // ==========================================

    public canStartGame(playerId: string): { canStart: boolean; error?: string } {
        if (playerId !== this.hostId) {
            return { canStart: false, error: 'NOT_HOST' };
        }
        if (this.players.size < MIN_PLAYERS) {
            return { canStart: false, error: 'NOT_ENOUGH_PLAYERS' };
        }

        const allReady = Array.from(this.players.values()).every(p => p.player.ready || p.player.id === this.hostId);
        if (!allReady) {
            return { canStart: false, error: 'NOT_ALL_READY' };
        }

        return { canStart: true };
    }

    public startGame(): void {
        this.status = 'IN_GAME';

        // Reset all players to alive
        for (const conn of this.players.values()) {
            conn.player.alive = true;
        }

        // Pick first dealer (random seat from alive players)
        const aliveSeats = this.getAliveSeats();
        const dealerSeat = aliveSeats[Math.floor(Math.random() * aliveSeats.length)];

        this.game = {
            phase: 'DEALER_SETUP',
            dealerSeat,
            turnSeat: -1,
            roundIndex: 0,
            aliveSeats,
            facedownSeats: [],
            actedSeats: [],
            deadlineTs: null,
            cheeseSeats: [], // Caseus Vitae
        };

        // Wait for dealer to assign cards
        this.broadcastPhase();
    }

    /**
     * Handle disconnected dealer during DEALER_SETUP.
     * Auto-assigns cards randomly with valid composition.
     */
    private handleDisconnectedDealerSetup(): void {
        if (!this.game || this.game.phase !== 'DEALER_SETUP') return;

        const aliveSeats = this.getAliveSeats();
        const n = aliveSeats.length;

        if (n < 2) {
            this.endGame();
            return;
        }

        // Create random but valid assignment: at least 1 SAFE and 1 DOOM
        const assignments: Record<number, 'SAFE' | 'DOOM'> = {};

        // Guarantee at least 1 DOOM and 1 SAFE
        const shuffledSeats = this.shuffle([...aliveSeats]);
        assignments[shuffledSeats[0]] = 'DOOM';
        assignments[shuffledSeats[1]] = 'SAFE';

        // Randomly assign the rest
        for (let i = 2; i < shuffledSeats.length; i++) {
            assignments[shuffledSeats[i]] = Math.random() < 0.5 ? 'SAFE' : 'DOOM';
        }

        // Apply the auto-assignment using existing logic
        this.handleDealerSet(this.game.dealerSeat, assignments);
    }

    // DEALER MODE: Accept card assignments from dealer
    public handleDealerSet(dealerSeat: number, assignments: Record<number, 'SAFE' | 'DOOM'>): { success: boolean; error?: string } {
        if (!this.game || this.game.phase !== 'DEALER_SETUP') {
            return { success: false, error: 'INVALID_ACTION' };
        }
        if (dealerSeat !== this.game.dealerSeat) {
            return { success: false, error: 'NOT_DEALER' };
        }

        const aliveSeats = this.getAliveSeats();

        // Validate all alive players have assignments
        for (const seat of aliveSeats) {
            if (!assignments[seat]) {
                return { success: false, error: 'MISSING_ASSIGNMENTS' };
            }
        }

        // Validate at least 1 SAFE and 1 DOOM
        const cards = Object.values(assignments);
        const hasSafe = cards.some(c => c === 'SAFE');
        const hasDoom = cards.some(c => c === 'DOOM');
        if (!hasSafe || !hasDoom) {
            return { success: false, error: 'INVALID_COMPOSITION' };
        }

        // Apply assignments
        this.cardBySeat.clear();
        for (const [seatStr, cardType] of Object.entries(assignments)) {
            this.cardBySeat.set(parseInt(seatStr), cardType);
        }

        this.game.facedownSeats = [...aliveSeats];
        this.game.actedSeats = [];
        this.game.phase = 'DEALING';

        // Handle cheese distribution
        this.game.cheeseSeats = [];
        for (const conn of this.players.values()) {
            conn.player.hasCheese = false;
        }

        if (this.settings.cheeseEnabled && aliveSeats.length >= 3) {
            const cheeseCount = Math.min(this.settings.cheeseCount, aliveSeats.length - 1);
            const shuffledSeats = this.shuffle([...aliveSeats]);
            const cheeseRecipients = shuffledSeats.slice(0, cheeseCount);

            for (const seat of cheeseRecipients) {
                this.game.cheeseSeats.push(seat);
                const playerId = this.seatToPlayerId.get(seat);
                if (playerId) {
                    const conn = this.players.get(playerId);
                    if (conn) conn.player.hasCheese = true;
                }
            }
        }

        // Broadcast dealt event
        this.broadcast({
            op: 'DEALT',
            aliveSeats,
        });

        if (this.settings.cheeseEnabled) {
            this.broadcast({
                op: 'CHEESE_UPDATE',
                cheeseSeats: this.game.cheeseSeats,
            });
        }

        // Start turns after short delay
        setTimeout(() => {
            this.startTurns();
        }, 1500);

        return { success: true };
    }

    private startNewRoundSetup(): void {
        if (!this.game) return;

        const aliveSeats = this.getAliveSeats();
        const n = aliveSeats.length;

        // Need at least 2 players to continue
        if (n < 2) {
            this.endGame();
            return;
        }

        // Always wait for dealer to assign cards
        this.game.phase = 'DEALER_SETUP';
        this.game.facedownSeats = [];
        this.game.actedSeats = [];
        this.broadcastPhase();
    }

    private shuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    private startTurns(): void {
        if (!this.game) return;

        this.game.phase = 'TURNS';

        // First player is left of dealer (next seat clockwise)
        const turnSeat = this.getNextAliveSeat(this.game.dealerSeat);

        // If only dealer left (shouldn't happen), skip to awaiting reveal
        if (turnSeat === this.game.dealerSeat) {
            this.awaitingReveal();
            return;
        }

        this.game.turnSeat = turnSeat;
        this.setTurnDeadline();
        this.broadcastPhase();
    }

    private setTurnDeadline(): void {
        if (!this.game) return;

        this.clearTimers();

        const turnPlayerId = this.seatToPlayerId.get(this.game.turnSeat);
        if (!turnPlayerId) return;

        const conn = this.players.get(turnPlayerId);
        if (!conn) return;

        // Use shorter timeout for disconnected players, normal timer for connected
        const timeoutSeconds = conn.player.connected
            ? this.settings.turnTimer
            : DISCONNECTED_TURN_TIMEOUT;

        const deadline = Date.now() + timeoutSeconds * 1000;
        this.game.deadlineTs = deadline;

        this.turnTimer = setTimeout(() => {
            this.handleTurnTimeout();
        }, timeoutSeconds * 1000);
    }

    private handleTurnTimeout(): void {
        if (!this.game || this.game.phase !== 'TURNS') return;

        // Auto-drink on timeout
        this.handleDrink(this.game.turnSeat, true);
    }

    public handleDrink(seat: number, isTimeout = false): void {
        if (!this.game || this.game.phase !== 'TURNS') return;
        if (seat !== this.game.turnSeat) return;
        if (this.game.actedSeats.includes(seat)) return;

        this.clearTimers();

        // Mark as acted
        this.game.actedSeats.push(seat);

        // Remove from facedown
        this.game.facedownSeats = this.game.facedownSeats.filter(s => s !== seat);

        // Get card and reveal
        const cardType = this.cardBySeat.get(seat)!;

        // Caseus Vitae: Check if player has cheese - reverses outcome!
        const hasCheese = this.game.cheeseSeats.includes(seat);
        let shouldEliminate = cardType === 'DOOM';

        if (hasCheese) {
            // With cheese: SAFE = eliminated, DOOM = survive!
            shouldEliminate = cardType === 'SAFE';
        }

        this.broadcast({
            op: 'REVEAL',
            seat,
            cardType,
        });

        // Eliminate based on cheese-modified outcome
        if (shouldEliminate) {
            this.eliminatePlayer(seat);
        }

        // Move to next turn or final reveal
        this.advanceTurn();
    }

    public handleSwap(fromSeat: number, targetSeat: number): { success: boolean; error?: string } {
        if (!this.game || this.game.phase !== 'TURNS') {
            return { success: false, error: 'INVALID_ACTION' };
        }
        if (fromSeat !== this.game.turnSeat) {
            return { success: false, error: 'NOT_YOUR_TURN' };
        }
        if (this.game.actedSeats.includes(fromSeat)) {
            return { success: false, error: 'ALREADY_ACTED' };
        }
        if (!this.game.facedownSeats.includes(targetSeat)) {
            return { success: false, error: 'INVALID_TARGET' };
        }
        if (fromSeat === targetSeat) {
            return { success: false, error: 'INVALID_TARGET' };
        }

        // Check target is alive
        const targetPlayer = this.getPlayerBySeat(targetSeat);
        if (!targetPlayer || !targetPlayer.alive) {
            return { success: false, error: 'INVALID_TARGET' };
        }

        this.clearTimers();

        // Mark as acted
        this.game.actedSeats.push(fromSeat);

        // Swap cards
        const fromCard = this.cardBySeat.get(fromSeat)!;
        const toCard = this.cardBySeat.get(targetSeat)!;
        this.cardBySeat.set(fromSeat, toCard);
        this.cardBySeat.set(targetSeat, fromCard);

        // Broadcast swap (no card types revealed!)
        this.broadcast({
            op: 'SWAP',
            fromSeat,
            toSeat: targetSeat,
        });

        // Move to next turn
        this.advanceTurn();

        return { success: true };
    }

    // Caseus Vitae: Steal cheese from another player
    public handleStealCheese(fromSeat: number, targetSeat: number): { success: boolean; error?: string } {
        if (!this.game || this.game.phase !== 'TURNS') {
            return { success: false, error: 'INVALID_ACTION' };
        }
        if (!this.settings.cheeseEnabled) {
            return { success: false, error: 'INVALID_ACTION' };
        }
        if (fromSeat !== this.game.turnSeat) {
            return { success: false, error: 'NOT_YOUR_TURN' };
        }
        if (this.game.actedSeats.includes(fromSeat)) {
            return { success: false, error: 'ALREADY_ACTED' };
        }
        if (fromSeat === targetSeat) {
            return { success: false, error: 'INVALID_TARGET' };
        }

        // Check if stealer already has cheese (can only hold 1)
        if (this.game.cheeseSeats.includes(fromSeat)) {
            return { success: false, error: 'ALREADY_HAS_CHEESE' };
        }

        // Check if target has cheese
        if (!this.game.cheeseSeats.includes(targetSeat)) {
            return { success: false, error: 'NO_CHEESE_TO_STEAL' };
        }

        // Check target is alive
        const targetPlayer = this.getPlayerBySeat(targetSeat);
        if (!targetPlayer || !targetPlayer.alive) {
            return { success: false, error: 'INVALID_TARGET' };
        }

        this.clearTimers();

        // Mark as acted
        this.game.actedSeats.push(fromSeat);

        // Transfer cheese
        this.game.cheeseSeats = this.game.cheeseSeats.filter(s => s !== targetSeat);
        this.game.cheeseSeats.push(fromSeat);

        // Update player states
        const fromPlayerId = this.seatToPlayerId.get(fromSeat);
        const toPlayerId = this.seatToPlayerId.get(targetSeat);

        if (fromPlayerId) {
            const conn = this.players.get(fromPlayerId);
            if (conn) conn.player.hasCheese = true;
        }
        if (toPlayerId) {
            const conn = this.players.get(toPlayerId);
            if (conn) conn.player.hasCheese = false;
        }

        // Broadcast cheese stolen
        this.broadcast({
            op: 'CHEESE_STOLEN',
            fromSeat: targetSeat, // Who lost cheese
            toSeat: fromSeat, // Who got cheese
        });

        this.broadcast({
            op: 'CHEESE_UPDATE',
            cheeseSeats: this.game.cheeseSeats,
        });

        // Move to next turn
        this.advanceTurn();

        return { success: true };
    }

    private advanceTurn(): void {
        if (!this.game) return;

        // Find next player who:
        // 1. Is alive
        // 2. Has not acted
        // 3. Is not the dealer

        let nextSeat = this.getNextAliveSeat(this.game.turnSeat);

        // Check if we've gone full circle back to dealer
        // or if next seat has already acted, or if they're dead now
        while (
            nextSeat !== this.game.dealerSeat &&
            (this.game.actedSeats.includes(nextSeat) || !this.isPlayerAlive(nextSeat))
        ) {
            nextSeat = this.getNextAliveSeat(nextSeat);

            // Safety: if we loop all the way around, stop
            if (nextSeat === this.game.turnSeat) break;
        }

        // If we reached the dealer or all have acted, wait for dealer to trigger reveal
        if (nextSeat === this.game.dealerSeat || this.allNonDealersActed()) {
            this.awaitingReveal();
        } else {
            this.game.turnSeat = nextSeat;
            this.setTurnDeadline();
            this.broadcastPhase();
        }
    }

    private allNonDealersActed(): boolean {
        if (!this.game) return true;

        for (const seat of this.game.aliveSeats) {
            if (seat !== this.game.dealerSeat && !this.game.actedSeats.includes(seat)) {
                // Check if they're still alive and have a facedown card
                if (this.isPlayerAlive(seat) && this.game.facedownSeats.includes(seat)) {
                    return false;
                }
            }
        }
        return true;
    }

    // Called when all players have acted - waits for dealer to trigger reveals
    private awaitingReveal(): void {
        if (!this.game) return;

        this.clearTimers();
        this.game.phase = 'AWAITING_REVEAL';
        this.game.deadlineTs = null;

        this.broadcastPhase();
    }

    // Dealer triggers the reveal sequence
    public handleStartReveal(dealerSeat: number): { success: boolean; error?: string } {
        if (!this.game || this.game.phase !== 'AWAITING_REVEAL') {
            return { success: false, error: 'INVALID_ACTION' };
        }

        if (this.game.dealerSeat !== dealerSeat) {
            return { success: false, error: 'NOT_DEALER' };
        }

        this.startRevealSequence();
        return { success: true };
    }

    // Actually perform the reveal sequence
    private startRevealSequence(): void {
        if (!this.game) return;

        this.game.phase = 'FINAL_REVEAL';
        this.broadcastPhase();

        // Reveal all remaining facedown cards with delays
        const toReveal = [...this.game.facedownSeats];
        let delay = FINAL_REVEAL.INITIAL_DELAY_MS;

        for (const seat of toReveal) {
            setTimeout(() => {
                if (!this.game) return;

                const cardType = this.cardBySeat.get(seat)!;

                // Caseus Vitae: Check if player has cheese - reverses outcome!
                const hasCheese = this.game.cheeseSeats.includes(seat);
                let shouldEliminate = cardType === 'DOOM';

                if (hasCheese) {
                    // With cheese: SAFE = eliminated, DOOM = survive!
                    shouldEliminate = cardType === 'SAFE';
                }

                this.broadcast({
                    op: 'REVEAL',
                    seat,
                    cardType,
                });

                if (shouldEliminate) {
                    this.eliminatePlayer(seat);
                }

                this.game.facedownSeats = this.game.facedownSeats.filter(s => s !== seat);
            }, delay);

            // Wait for full client animation before next reveal
            delay += FINAL_REVEAL.PER_REVEAL_DURATION_MS;
        }

        // After all reveals complete on client, check game end
        setTimeout(() => {
            this.checkRoundEnd();
        }, delay + FINAL_REVEAL.BUFFER_MS);
    }

    private eliminatePlayer(seat: number): void {
        const playerId = this.seatToPlayerId.get(seat);
        if (playerId) {
            const conn = this.players.get(playerId);
            if (conn) {
                conn.player.alive = false;
            }
        }

        if (this.game) {
            this.game.aliveSeats = this.game.aliveSeats.filter(s => s !== seat);
        }

        this.broadcast({
            op: 'ELIM',
            seat,
        });
    }

    private checkRoundEnd(): void {
        if (!this.game) return;

        const aliveCount = this.game.aliveSeats.length;

        if (aliveCount <= 1) {
            // Game over
            this.endGame();
        } else {
            // Start new round
            this.startNewRound();
        }
    }

    private startNewRound(): void {
        if (!this.game) return;

        // Select next dealer (first alive clockwise from current dealer)
        const nextDealer = this.getNextAliveSeat(this.game.dealerSeat);

        this.game.phase = 'ROUND_END';
        this.game.roundIndex++;

        this.broadcast({
            op: 'ROUND_END',
            nextDealerSeat: nextDealer,
        });

        // Short delay then go to dealer setup for next round
        setTimeout(() => {
            if (!this.game) return;
            this.game.dealerSeat = nextDealer;
            this.startNewRoundSetup();
        }, 2000);
    }

    private endGame(): void {
        if (!this.game) return;

        const winnerSeat = this.game.aliveSeats[0] ?? -1;

        this.game.phase = 'GAME_END';

        this.broadcast({
            op: 'GAME_END',
            winnerSeat,
        });

        // Start voting for rematch
        this.startRematchVoting();
    }

    private returnToLobby(): void {
        this.clearTimers();
        this.status = 'LOBBY';
        this.game = null;
        this.cardBySeat.clear();
        this.isVotingPhase = false;
        this.rematchVotes.clear();

        // Reset player states
        for (const conn of this.players.values()) {
            conn.player.ready = false;
            conn.player.alive = true;
            conn.player.hasCheese = false; // Caseus Vitae
        }

        this.broadcastLobbyUpdate();
    }

    // ==========================================
    // Rematch Voting
    // ==========================================

    private startRematchVoting(): void {
        this.isVotingPhase = true;
        this.rematchVotes.clear();
        this.clearTimers();
        this.broadcastVoteUpdate();
    }

    public handleRematchVote(seat: number, vote: boolean): void {
        if (!this.isVotingPhase) return;

        if (vote) {
            this.rematchVotes.add(seat);
        } else {
            this.rematchVotes.delete(seat);
        }

        this.broadcastVoteUpdate();
        this.checkVoteResolution();
    }

    private checkVoteResolution(): void {
        if (!this.isVotingPhase) return;

        const connectedSeats = this.getConnectedSeats();
        const requiredVotes = connectedSeats.length;

        // Check if all connected players have voted yes
        const allVotedYes = connectedSeats.every(seat => this.rematchVotes.has(seat));

        if (allVotedYes && requiredVotes > 0) {
            this.isVotingPhase = false;

            // Broadcast that we're starting
            this.broadcast({
                op: 'VOTE_UPDATE',
                votedYes: Array.from(this.rematchVotes),
                requiredVotes,
                phase: 'STARTING',
            });

            // Return to lobby for a fresh start
            setTimeout(() => {
                this.returnToLobby();
            }, 1500);
        }
    }

    public handlePlayerLeave(playerId: string): void {
        const conn = this.players.get(playerId);
        if (!conn) return;

        const seat = conn.player.seat;

        // Remove their vote if they had one
        this.rematchVotes.delete(seat);

        // Broadcast that they left
        this.broadcast({
            op: 'PLAYER_LEFT',
            seat,
            reason: 'left',
        });

        // Remove from room
        this.removePlayer(playerId);

        // Check if vote can now resolve (fewer players needed)
        if (this.isVotingPhase) {
            this.broadcastVoteUpdate();
            this.checkVoteResolution();
        }
    }

    private broadcastVoteUpdate(): void {
        const connectedSeats = this.getConnectedSeats();
        this.broadcast({
            op: 'VOTE_UPDATE',
            votedYes: Array.from(this.rematchVotes),
            requiredVotes: connectedSeats.length,
            phase: 'VOTING',
        });
    }

    private getConnectedSeats(): number[] {
        return Array.from(this.players.values())
            .filter(c => c.player.connected)
            .map(c => c.player.seat);
    }

    public isInVotingPhase(): boolean {
        return this.isVotingPhase;
    }

    private checkGameEnd(): void {
        if (!this.game) return;

        this.game.aliveSeats = this.getAliveSeats();

        if (this.game.aliveSeats.length <= 1) {
            this.endGame();
        }
    }

    // ==========================================
    // Helpers
    // ==========================================

    private getAliveSeats(): number[] {
        return Array.from(this.players.values())
            .filter(c => c.player.alive)
            .map(c => c.player.seat)
            .sort((a, b) => a - b);
    }

    private getNextAliveSeat(currentSeat: number): number {
        const aliveSeats = this.getAliveSeats();
        if (aliveSeats.length === 0) return currentSeat;

        const sorted = aliveSeats.sort((a, b) => a - b);

        for (const seat of sorted) {
            if (seat > currentSeat) return seat;
        }

        // Wrap around
        return sorted[0];
    }

    private getNextSeat(currentSeat: number): number {
        const allSeats = Array.from(this.players.values())
            .map(c => c.player.seat)
            .sort((a, b) => a - b);

        if (allSeats.length === 0) return currentSeat;

        for (const seat of allSeats) {
            if (seat > currentSeat) return seat;
        }

        return allSeats[0];
    }

    private isPlayerAlive(seat: number): boolean {
        const playerId = this.seatToPlayerId.get(seat);
        if (!playerId) return false;
        const conn = this.players.get(playerId);
        return conn?.player.alive ?? false;
    }

    private getPlayerBySeat(seat: number): Player | undefined {
        const playerId = this.seatToPlayerId.get(seat);
        if (!playerId) return undefined;
        return this.players.get(playerId)?.player;
    }

    private clearTimers(): void {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        if (this.dealerTimer) {
            clearTimeout(this.dealerTimer);
            this.dealerTimer = null;
        }
    }

    // ==========================================
    // Broadcasting
    // ==========================================

    public broadcast(message: Record<string, unknown>): void {
        const data = JSON.stringify(message);

        for (const conn of this.players.values()) {
            if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(data);
            }
        }
    }

    public broadcastExcept(excludePlayerId: string, message: Record<string, unknown>): void {
        const data = JSON.stringify(message);

        for (const [playerId, conn] of this.players) {
            if (playerId !== excludePlayerId && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(data);
            }
        }
    }

    public sendTo(playerId: string, message: Record<string, unknown>): void {
        const conn = this.players.get(playerId);
        if (conn?.ws && conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(JSON.stringify(message));
        }
    }

    private broadcastPhase(): void {
        if (!this.game) return;

        this.broadcast({
            op: 'PHASE',
            phase: this.game.phase,
            dealerSeat: this.game.dealerSeat,
            turnSeat: this.game.turnSeat,
            deadlineTs: this.game.deadlineTs,
            aliveSeats: this.game.aliveSeats,
        });
    }

    private broadcastLobbyUpdate(): void {
        const players = Array.from(this.players.values()).map(c => c.player);

        this.broadcast({
            op: 'LOBBY_UPDATE',
            players,
            settings: this.settings,
        });
    }

    // ==========================================
    // State Getters
    // ==========================================

    public getFullState(playerId: string): FullState {
        const conn = this.players.get(playerId);

        return {
            room: this.getRoomState(),
            game: this.game,
            yourSeat: conn?.player.seat ?? -1,
            yourPlayerId: playerId,
        };
    }

    public getRoomState(): RoomState {
        return {
            id: this.id,
            joinCode: this.joinCode,
            hostId: this.hostId,
            settings: this.settings,
            players: Array.from(this.players.values()).map(c => c.player),
            status: this.status,
            createdAt: this.createdAt,
        };
    }

    public updateSettings(playerId: string, settings: Partial<RoomSettings>): { success: boolean; error?: string } {
        if (playerId !== this.hostId) {
            return { success: false, error: 'NOT_HOST' };
        }

        if (this.status !== 'LOBBY') {
            return { success: false, error: 'GAME_IN_PROGRESS' };
        }

        this.settings = { ...this.settings, ...settings };
        this.broadcastLobbyUpdate();

        return { success: true };
    }

    public getWsForPlayer(playerId: string): WebSocket | null {
        return this.players.get(playerId)?.ws ?? null;
    }
}
