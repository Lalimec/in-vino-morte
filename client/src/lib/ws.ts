import { CLIENT_OPS, SERVER_OPS } from '@in-vino-morte/shared';
import { ServerMessageSchema } from '@in-vino-morte/shared';
import { useGameStore } from '@/stores/gameStore';
import { getWebSocketUrl } from '@/lib/config';

type MessageHandler = (message: Record<string, unknown>) => void;

class WebSocketClient {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectAttempts = 0;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 5000;
    private intentionallyClosed = false;
    private networkListenersAdded = false;
    private pingInterval: NodeJS.Timeout | null = null;
    private messageHandlers: Map<string, MessageHandler[]> = new Map();

    constructor(url: string) {
        this.url = url;
        this.setupNetworkListeners();
    }

    /**
     * Resolve the reconnect token: prefer the in-memory store, fall back to the
     * persisted copy (survives a webview reload).
     */
    private getToken(): string | null {
        const storeToken = useGameStore.getState().token;
        if (storeToken) return storeToken;
        if (typeof window !== 'undefined') {
            try { return window.localStorage.getItem('authToken'); } catch { /* ignore */ }
        }
        return null;
    }

    /**
     * Re-join the room after a (re)connect, using whatever identity we have.
     */
    private rejoin(): void {
        const store = useGameStore.getState();
        const token = this.getToken();
        if (token && store.playerName) {
            this.join(token, store.playerName, store.avatarId);
        }
    }

    /**
     * Reconnect immediately if we're not already connected. Called when the
     * network comes back or the app returns to the foreground - critical on
     * mobile, where the OS freezes the webview while backgrounded.
     */
    private ensureConnected(): void {
        if (this.intentionallyClosed) return;
        const live = this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
        if (live) return;
        this.reconnectAttempts = 0; // fresh budget on an explicit resume
        this.connect().then(() => this.rejoin()).catch(() => { /* onclose will retry */ });
    }

    private setupNetworkListeners(): void {
        if (typeof window === 'undefined' || this.networkListenersAdded) return;
        this.networkListenersAdded = true;

        window.addEventListener('online', () => this.ensureConnected());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.ensureConnected();
        });
    }

    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const store = useGameStore.getState();
            store.setConnecting(true);
            this.intentionallyClosed = false;

            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    console.log('🔌 WebSocket connected');
                    store.setConnected(true);
                    this.reconnectAttempts = 0;
                    this.startPing();
                    resolve();
                };

                this.ws.onclose = (event) => {
                    console.log('🔌 WebSocket disconnected', event.code, event.reason);
                    store.setConnected(false);
                    this.stopPing();

                    // Attempt reconnect if not a clean close
                    if (event.code !== 1000) {
                        this.attemptReconnect();
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('🔌 WebSocket error', error);
                    store.setConnectionError('Connection error');
                    reject(error);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
            } catch (error) {
                store.setConnectionError('Failed to connect');
                reject(error);
            }
        });
    }

    private handleMessage(data: string): void {
        try {
            const raw = JSON.parse(data);
            const parsed = ServerMessageSchema.safeParse(raw);

            if (!parsed.success) {
                console.warn('Invalid message received:', raw);
                return;
            }

            const message = parsed.data;
            const store = useGameStore.getState();

            switch (message.op) {
                case SERVER_OPS.STATE:
                    store.setFullState({
                        room: message.room,
                        game: message.game,
                        yourSeat: message.yourSeat,
                        yourPlayerId: message.yourPlayerId,
                    });
                    break;

                case SERVER_OPS.LOBBY_UPDATE:
                    store.updateLobby(message.players, message.settings);
                    break;

                case SERVER_OPS.PHASE:
                    store.updatePhase(message.phase, message.dealerSeat, message.turnSeat, message.deadlineTs, message.aliveSeats, message.facedownSeats, message.actedSeats, message.cheeseSeats);
                    break;

                case SERVER_OPS.DEALT:
                    store.setDealt(message.aliveSeats);
                    break;

                case SERVER_OPS.SWAP:
                    store.setSwap(message.fromSeat, message.toSeat);
                    this.emit('swap', { fromSeat: message.fromSeat, toSeat: message.toSeat });
                    break;

                case SERVER_OPS.REVEAL:
                    store.addReveal(message.seat, message.cardType);
                    this.emit('reveal', { seat: message.seat, cardType: message.cardType });
                    break;

                case SERVER_OPS.ELIM:
                    store.addElimination(message.seat);
                    this.emit('elim', { seat: message.seat });
                    break;

                case SERVER_OPS.ROUND_END:
                    store.setRoundEnd(message.nextDealerSeat);
                    break;

                case SERVER_OPS.GAME_END:
                    store.setGameEnd(message.winnerSeat);
                    this.emit('gameEnd', { winnerSeat: message.winnerSeat });
                    break;

                case SERVER_OPS.ERROR:
                    console.error('Server error:', message.code, message.message);
                    this.emit('error', { code: message.code, message: message.message });
                    break;

                case SERVER_OPS.PONG:
                    // Latency tracking could be added here
                    break;

                // Caseus Vitae: Cheese events
                case SERVER_OPS.CHEESE_STOLEN:
                    store.addCheeseStolen(message.fromSeat, message.toSeat);
                    this.emit('cheeseStolen', { fromSeat: message.fromSeat, toSeat: message.toSeat });
                    break;

                case SERVER_OPS.CHEESE_UPDATE:
                    store.updateCheeseSeats(message.cheeseSeats);
                    this.emit('cheeseUpdate', { cheeseSeats: message.cheeseSeats });
                    break;

                case SERVER_OPS.DEALER_PREVIEW:
                    // Only receive whether seat is assigned, NOT the card type (that's secret!)
                    this.emit('dealerPreview', { seat: message.seat, assigned: message.assigned });
                    break;

                case SERVER_OPS.VOTE_UPDATE:
                    store.updateVoteStatus(message.votedYes, message.requiredVotes, message.phase);
                    this.emit('voteUpdate', { votedYes: message.votedYes, requiredVotes: message.requiredVotes, phase: message.phase });
                    break;

                case SERVER_OPS.PLAYER_LEFT:
                    store.handlePlayerLeft(message.seat, message.reason);
                    this.emit('playerLeft', { seat: message.seat, reason: message.reason });
                    break;

                case SERVER_OPS.PLAYER_RECONNECTED:
                    store.handlePlayerReconnected(message.seat);
                    this.emit('playerReconnected', { seat: message.seat });
                    break;
            }
        } catch (error) {
            console.error('Failed to handle message:', error);
        }
    }

    public send(message: Record<string, unknown>): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('Cannot send message, WebSocket not connected');
        }
    }

    public join(token: string, name: string, avatarId: number): void {
        this.send({
            op: CLIENT_OPS.JOIN,
            token,
            name,
            avatarId,
        });
    }

    public setReady(ready: boolean): void {
        this.send({
            op: CLIENT_OPS.READY,
            ready,
        });
    }

    public startGame(): void {
        this.send({
            op: CLIENT_OPS.START_GAME,
        });
    }

    public updateSettings(settings: { cheeseEnabled?: boolean; cheeseCount?: number }): void {
        this.send({
            op: CLIENT_OPS.UPDATE_SETTINGS,
            settings,
        });
    }

    public drink(): void {
        this.send({
            op: CLIENT_OPS.ACTION_DRINK,
        });
    }

    public swap(targetSeat: number): void {
        this.send({
            op: CLIENT_OPS.ACTION_SWAP,
            targetSeat,
        });
    }

    // Caseus Vitae: Steal cheese from another player
    public stealCheese(targetSeat: number): void {
        this.send({
            op: CLIENT_OPS.ACTION_STEAL_CHEESE,
            targetSeat,
        });
    }

    // Dealer Mode: Send card assignments
    public dealerSet(composition: Array<'SAFE' | 'DOOM'>): void {
        this.send({
            op: CLIENT_OPS.DEALER_SET,
            composition,
        });
    }

    // Dealer Mode: Send real-time preview of assignment
    public dealerPreview(seat: number, cardType: 'SAFE' | 'DOOM' | null): void {
        this.send({
            op: CLIENT_OPS.DEALER_PREVIEW,
            seat,
            cardType,
        });
    }

    // Dealer triggers the reveal sequence after all players have acted
    public startReveal(): void {
        this.send({
            op: CLIENT_OPS.START_REVEAL,
        });
    }

    // Rematch voting: Vote yes or retract vote
    public voteRematch(vote: boolean): void {
        this.send({
            op: CLIENT_OPS.VOTE_REMATCH,
            vote,
        });
    }

    // Leave the room voluntarily
    public leaveRoom(): void {
        this.send({
            op: CLIENT_OPS.LEAVE_ROOM,
        });
    }

    public disconnect(): void {
        this.intentionallyClosed = true;
        this.stopPing();
        if (this.ws) {
            this.ws.close(1000);
            this.ws = null;
        }
    }

    private startPing(): void {
        this.pingInterval = setInterval(() => {
            this.send({
                op: CLIENT_OPS.PING,
                t: Date.now(),
            });
        }, 25000);
    }

    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private attemptReconnect(): void {
        // Never give up while the app is open: party players background their
        // phones for minutes. Retry forever with exponential backoff capped at
        // maxReconnectDelay; the 'online' / 'visibilitychange' listeners also
        // trigger an immediate reconnect when the device wakes up.
        if (this.intentionallyClosed) return;

        this.reconnectAttempts++;
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );

        console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            // Bail if something already reconnected us in the meantime.
            if (this.intentionallyClosed) return;
            if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

            this.connect()
                .then(() => this.rejoin())
                .catch(() => { /* onclose schedules the next attempt */ });
        }, delay);
    }

    // Event emitter pattern for UI components to subscribe to specific events
    public on(event: string, handler: MessageHandler): void {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, []);
        }
        this.messageHandlers.get(event)!.push(handler);
    }

    public off(event: string, handler: MessageHandler): void {
        const handlers = this.messageHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    private emit(event: string, data: Record<string, unknown>): void {
        const handlers = this.messageHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWsClient(): WebSocketClient {
    if (!wsClient) {
        const wsUrl = getWebSocketUrl();
        wsClient = new WebSocketClient(wsUrl);
    }
    return wsClient;
}

export function resetWsClient(): void {
    if (wsClient) {
        wsClient.disconnect();
        wsClient = null;
    }
}
