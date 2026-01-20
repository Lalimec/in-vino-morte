import { create } from 'zustand';
import type { FullState, GameState, Player, RoomSettings } from '@in-vino-morte/shared';

interface GameStore {
    // Connection state
    isConnected: boolean;
    isConnecting: boolean;
    connectionError: string | null;

    // Room state
    roomId: string | null;
    joinCode: string | null;
    hostId: string | null;
    players: Player[];
    settings: RoomSettings | null;
    roomStatus: 'LOBBY' | 'IN_GAME' | null;

    // Game state
    game: GameState | null;
    yourSeat: number;
    yourPlayerId: string | null;

    // Local player info
    playerName: string;
    avatarId: number;
    token: string | null;

    // UI state
    soundEnabled: boolean;
    motionEnabled: boolean;

    // Pending reveals for animation queuing
    pendingReveals: Array<{ seat: number; cardType: 'SAFE' | 'DOOM' }>;
    pendingEliminations: number[];
    pendingCheeseStolen: Array<{ fromSeat: number; toSeat: number }>; // Caseus Vitae
    pendingSwaps: Array<{ fromSeat: number; toSeat: number }>; // Flying card animation

    // Rematch voting state
    votingPhase: 'VOTING' | 'STARTING' | 'CANCELLED' | null;
    votedSeats: number[];
    requiredVotes: number;

    // Actions
    setConnected: (connected: boolean) => void;
    setConnecting: (connecting: boolean) => void;
    setConnectionError: (error: string | null) => void;
    setFullState: (state: FullState) => void;
    updateLobby: (players: Player[], settings: RoomSettings) => void;
    updatePhase: (phase: GameState['phase'], dealerSeat: number, turnSeat: number, deadlineTs: number | null, aliveSeats: number[]) => void;
    addReveal: (seat: number, cardType: 'SAFE' | 'DOOM') => void;
    consumeReveal: () => { seat: number; cardType: 'SAFE' | 'DOOM' } | undefined;
    addElimination: (seat: number) => void;
    consumeElimination: () => number | undefined;
    setGameEnd: (winnerSeat: number) => void;
    setSwap: (fromSeat: number, toSeat: number) => void;
    setDealt: (aliveSeats: number[]) => void;
    setRoundEnd: (nextDealerSeat: number) => void;
    updateCheeseSeats: (cheeseSeats: number[]) => void; // Caseus Vitae
    addCheeseStolen: (fromSeat: number, toSeat: number) => void; // Caseus Vitae
    consumeCheeseStolen: () => { fromSeat: number; toSeat: number } | undefined; // Caseus Vitae
    addSwap: (fromSeat: number, toSeat: number) => void; // Flying card animation
    consumeSwap: () => { fromSeat: number; toSeat: number } | undefined; // Flying card animation
    setPlayerInfo: (name: string, avatarId: number) => void;
    setToken: (token: string) => void;
    setRoomInfo: (roomId: string, joinCode: string) => void;
    toggleSound: () => void;
    toggleMotion: () => void;
    updateVoteStatus: (votedYes: number[], requiredVotes: number, phase: 'VOTING' | 'STARTING' | 'CANCELLED') => void;
    handlePlayerLeft: (seat: number, reason: 'disconnected' | 'left') => void;
    handlePlayerReconnected: (seat: number) => void;
    reset: () => void;
}

const initialState = {
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    roomId: null,
    joinCode: null,
    hostId: null,
    players: [],
    settings: null,
    roomStatus: null,
    game: null,
    yourSeat: -1,
    yourPlayerId: null,
    playerName: '',
    avatarId: 0,
    token: null,
    soundEnabled: true,
    motionEnabled: true,
    pendingReveals: [],
    pendingEliminations: [],
    pendingCheeseStolen: [], // Caseus Vitae
    pendingSwaps: [], // Flying card animation
    votingPhase: null,
    votedSeats: [],
    requiredVotes: 0,
};

export const useGameStore = create<GameStore>((set, get) => ({
    ...initialState,

    setConnected: (isConnected) => set({ isConnected, isConnecting: false }),
    setConnecting: (isConnecting) => set({ isConnecting, connectionError: null }),
    setConnectionError: (connectionError) => set({ connectionError, isConnecting: false }),

    setFullState: (state) => set({
        roomId: state.room.id,
        joinCode: state.room.joinCode,
        hostId: state.room.hostId,
        players: state.room.players,
        settings: state.room.settings,
        roomStatus: state.room.status,
        game: state.game,
        yourSeat: state.yourSeat,
        yourPlayerId: state.yourPlayerId,
    }),

    updateLobby: (players, settings) => set({
        players,
        settings,
        // Clear game state when returning to lobby (after rematch vote)
        game: null,
        roomStatus: 'LOBBY',
        // Clear any pending animations
        pendingReveals: [],
        pendingEliminations: [],
        pendingCheeseStolen: [],
        pendingSwaps: [],
        // Clear voting state
        votingPhase: null,
        votedSeats: [],
        requiredVotes: 0,
    }),

    updatePhase: (phase, dealerSeat, turnSeat, deadlineTs, aliveSeats) => set((state) => ({
        // When we receive a game phase (not LOBBY), we're IN_GAME
        roomStatus: phase !== 'LOBBY' ? 'IN_GAME' : state.roomStatus,
        // Update players' alive status based on aliveSeats from server
        players: state.players.map(p => ({
            ...p,
            alive: aliveSeats.includes(p.seat),
        })),
        game: state.game ? {
            ...state.game,
            phase,
            dealerSeat,
            turnSeat,
            deadlineTs,
            aliveSeats, // Update from server
        } : {
            // Initialize game state if it doesn't exist yet
            phase,
            dealerSeat,
            turnSeat,
            roundIndex: 0,
            aliveSeats,
            facedownSeats: [],
            actedSeats: [],
            deadlineTs,
            cheeseSeats: [],
        },
        // Clear pending queues when starting a new round (DEALER_SETUP)
        // This prevents stale animations from previous round corrupting state
        ...(phase === 'DEALER_SETUP' ? {
            pendingReveals: [],
            pendingEliminations: [],
            pendingSwaps: [],
        } : {}),
    })),

    addReveal: (seat, cardType) => set((state) => ({
        pendingReveals: [...state.pendingReveals, { seat, cardType }],
        // Remove from facedownSeats immediately - this player has revealed their card
        game: state.game ? {
            ...state.game,
            facedownSeats: state.game.facedownSeats.filter(s => s !== seat),
        } : null,
    })),

    consumeReveal: () => {
        const state = get();
        if (state.pendingReveals.length === 0) return undefined;
        const [first, ...rest] = state.pendingReveals;
        set({ pendingReveals: rest });
        return first;
    },

    // Queue elimination - DON'T update state yet, wait for animation
    addElimination: (seat) => set((state) => ({
        pendingEliminations: [...state.pendingEliminations, seat],
        // State update deferred to consumeElimination after reveal animation
    })),

    // Called AFTER reveal animation completes - NOW update the visual state
    consumeElimination: () => {
        const state = get();
        if (state.pendingEliminations.length === 0) return undefined;
        const [seat, ...rest] = state.pendingEliminations;
        set({
            pendingEliminations: rest,
            // NOW mark player as dead after animation showed it
            players: state.players.map(p => p.seat === seat ? { ...p, alive: false } : p),
            game: state.game ? {
                ...state.game,
                aliveSeats: state.game.aliveSeats.filter(s => s !== seat),
            } : null,
        });
        return seat;
    },

    setGameEnd: (winnerSeat) => set((state) => ({
        game: state.game ? {
            ...state.game,
            phase: 'GAME_END',
        } : null,
    })),

    setSwap: (fromSeat, toSeat) => set((state) => ({
        game: state.game ? {
            ...state.game,
            actedSeats: [...state.game.actedSeats, fromSeat],
        } : null,
        // Add to pending swaps for flying card animation
        pendingSwaps: [...state.pendingSwaps, { fromSeat, toSeat }],
    })),

    setDealt: (aliveSeats) => set((state) => ({
        game: state.game ? {
            ...state.game,
            phase: 'DEALING',
            aliveSeats,
            facedownSeats: aliveSeats,
            actedSeats: [],
        } : null,
        roomStatus: 'IN_GAME',
    })),

    setRoundEnd: (nextDealerSeat) => set((state) => ({
        game: state.game ? {
            ...state.game,
            phase: 'ROUND_END',
        } : null,
    })),

    // Caseus Vitae: Update cheese positions
    updateCheeseSeats: (cheeseSeats) => set((state) => ({
        game: state.game ? {
            ...state.game,
            cheeseSeats,
        } : null,
        players: state.players.map(p => ({
            ...p,
            hasCheese: cheeseSeats.includes(p.seat),
        })),
    })),

    // Caseus Vitae: Add cheese stolen event for animation
    addCheeseStolen: (fromSeat, toSeat) => set((state) => ({
        pendingCheeseStolen: [...state.pendingCheeseStolen, { fromSeat, toSeat }],
    })),

    consumeCheeseStolen: () => {
        const state = get();
        if (state.pendingCheeseStolen.length === 0) return undefined;
        const [first, ...rest] = state.pendingCheeseStolen;
        set({ pendingCheeseStolen: rest });
        return first;
    },

    // Flying card animation: add swap event
    addSwap: (fromSeat, toSeat) => set((state) => ({
        pendingSwaps: [...state.pendingSwaps, { fromSeat, toSeat }],
    })),

    consumeSwap: () => {
        const state = get();
        if (state.pendingSwaps.length === 0) return undefined;
        const [first, ...rest] = state.pendingSwaps;
        set({ pendingSwaps: rest });
        return first;
    },

    setPlayerInfo: (playerName, avatarId) => set({ playerName, avatarId }),
    setToken: (token) => set({ token }),
    setRoomInfo: (roomId, joinCode) => set({ roomId, joinCode }),

    toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
    toggleMotion: () => set((state) => ({ motionEnabled: !state.motionEnabled })),

    updateVoteStatus: (votedYes, requiredVotes, phase) => set({
        votedSeats: votedYes,
        requiredVotes,
        votingPhase: phase,
    }),

    handlePlayerLeft: (seat, reason) => set((state) => {
        // In LOBBY or if they explicitly left: remove player entirely
        if (state.roomStatus === 'LOBBY' || reason === 'left') {
            return {
                players: state.players.filter(p => p.seat !== seat),
                game: state.game ? {
                    ...state.game,
                    aliveSeats: state.game.aliveSeats.filter(s => s !== seat),
                } : null,
            };
        }

        // IN_GAME disconnect: just mark as disconnected, don't remove
        return {
            players: state.players.map(p =>
                p.seat === seat ? { ...p, connected: false } : p
            ),
        };
    }),

    handlePlayerReconnected: (seat) => set((state) => ({
        players: state.players.map(p =>
            p.seat === seat ? { ...p, connected: true } : p
        ),
    })),

    reset: () => set(initialState),
}));
