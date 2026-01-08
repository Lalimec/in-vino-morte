# In Vino Morte

A mobile-first realtime multiplayer party game for 3-8 players. Each round, a dealer distributes facedown drinks (SAFE or DOOM), and players must choose to Drink or Swap until one survivor remains.

## 🍷 Game Rules

1. **Setup**: 3-8 players join a room. One player becomes the dealer.
2. **Deal**: The dealer distributes facedown cards - a mix of SAFE and DOOM.
3. **Turns**: Starting left of the dealer, each player chooses one action:
   - **DRINK**: Reveal your card immediately. If DOOM, you're eliminated.
   - **SWAP**: Trade your facedown card with another player's facedown card.
4. **Final Reveal**: When all players have acted, remaining facedown cards are revealed.
5. **Elimination**: DOOM holders are eliminated.
6. **Victory**: Last player standing wins!

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/in-vino-morte.git
cd in-vino-morte

# Install dependencies
npm install

# Build shared package
npm run build:shared

# Start development servers
npm run dev
```

This starts:
- **Client**: http://localhost:3000
- **Server**: http://localhost:3001

### Production Build

```bash
npm run build
```

## 📁 Project Structure

```
in-vino-morte/
├── client/          # Next.js frontend
│   ├── src/
│   │   ├── app/     # Pages (landing, lobby, game)
│   │   ├── components/
│   │   ├── lib/     # WebSocket, audio, haptics
│   │   └── stores/  # Zustand state management
│   └── public/      # Static assets
├── server/          # Node.js WebSocket server
│   └── src/
│       ├── index.ts # Express + WebSocket entry
│       └── room.ts  # Game state machine
└── shared/          # Shared TypeScript code
    └── src/
        ├── schemas.ts   # Zod validation schemas
        ├── types.ts     # TypeScript interfaces
        └── constants.ts # Game constants
```

## 🎮 Features

- **Mobile-First Design**: Optimized for one-hand phone play
- **Realtime Multiplayer**: WebSocket-based instant updates
- **Series Mode**: First to 3 wins
- **Reconnection**: Rejoin games after disconnecting
- **Juicy Animations**: Spring physics, screen shake, particles
- **Haptic Feedback**: Vibration patterns for game events
- **Sound Effects**: Audio feedback for all actions

## 🔧 Configuration

### Environment Variables

**Client** (`client/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

**Server** (`server/.env`):
```
PORT=3001
```

## 🖥️ Deployment (Windows VPS)

### Using Caddy as Reverse Proxy

1. Install [Caddy](https://caddyserver.com/docs/install)

2. Configure Caddyfile:
```caddyfile
in-vino-morte.yourdomain.com {
    reverse_proxy localhost:3001
}
```

### Using NSSM as Windows Service

1. Install [NSSM](https://nssm.cc/download)

2. Create service:
```powershell
nssm install InVinoMorte "C:\path\to\node.exe" "C:\path\to\server\dist\index.js"
nssm set InVinoMorte AppDirectory "C:\path\to\server"
nssm start InVinoMorte
```

## 📜 License

MIT

## 🙏 Credits

Built with:
- [Next.js](https://nextjs.org/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Zod](https://zod.dev/)
- [ws](https://github.com/websockets/ws)
