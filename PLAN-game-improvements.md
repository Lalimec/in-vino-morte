# Implementation Plan: Game End Voting, Swap Animation, and Drag-Drop Actions

## Overview

Three major features to improve game experience:
1. **Rematch Voting System** - Replace auto-transitions with player voting
2. **Card Swap Animation** - Cards fly across the table during swap
3. **Drag-and-Drop Actions** - Primary interaction mode with button fallback

---

## Feature 1: Rematch Voting System

### Requirements
- When game ends (GAME_END or SERIES_END), don't auto-transition
- Show "Play Again" button for each player
- Track and display who has voted
- Wait indefinitely until all connected players vote
- Players who disconnect are removed from vote requirement
- "Leave" button removes player from room

### Implementation

#### Server Changes

**New Constants** (`shared/src/constants.ts`):
```typescript
// CLIENT_OPS
VOTE_REMATCH: 'VOTE_REMATCH',
LEAVE_ROOM: 'LEAVE_ROOM',

// SERVER_OPS
VOTE_UPDATE: 'VOTE_UPDATE',
PLAYER_LEFT: 'PLAYER_LEFT',
```

**New Schemas** (`shared/src/schemas.ts`):
- `VoteRematchMessageSchema` - player votes yes/no
- `LeaveRoomMessageSchema` - player leaves
- `VoteUpdateMessageSchema` - broadcast vote status
- `PlayerLeftMessageSchema` - notify when player leaves

**Room Logic** (`server/src/room.ts`):
- Add `rematchVotes: Set<number>` to track votes
- Add `isVotingPhase: boolean` flag
- Modify `endGame()` to call `startRematchVoting()` instead of auto-start
- Modify `endSeries()` to call `startRematchVoting()` instead of return to lobby
- Add methods: `handleRematchVote()`, `checkVoteResolution()`, `handlePlayerLeave()`

#### Client Changes

**WebSocket** (`client/src/lib/ws.ts`):
- Add `voteRematch(vote: boolean)` method
- Add `leaveRoom()` method
- Handle `VOTE_UPDATE` and `PLAYER_LEFT` messages

**Game Store** (`client/src/stores/gameStore.ts`):
- Add `rematchVotes`, `requiredVotes`, `votingPhase` state
- Add `updateVoteStatus()` and `handlePlayerLeft()` actions

**UI** (`client/src/app/game/[code]/page.tsx`):
- Replace game over overlay with voting screen
- Show list of players with vote status (checkmark or waiting)
- "Play Again" button (toggles vote)
- "Leave" button (exits game)
- Vote count display (X / Y voted)

---

## Feature 2: Card Swap Animation (Flying Cards)

### Requirements
- When swap happens, cards visually fly from one player to another
- Cards cross paths mid-animation (X pattern)
- Smooth 60fps animation with easing

### Implementation

#### Position Calculation
Create `getSeatAbsolutePosition()` helper that returns pixel coordinates for any seat based on:
- Seat index and total players
- Table container dimensions
- Circular layout math

#### Animation State
```typescript
const [swapAnimation, setSwapAnimation] = useState<{
    fromSeat: number;
    toSeat: number;
    fromPosition: { x: number; y: number };
    toPosition: { x: number; y: number };
} | null>(null);
```

#### Flying Card Overlay
Two absolutely positioned card elements that animate:
- Card A: flies from → to (arcs up)
- Card B: flies to → from (arcs down)
- Creates X crossing pattern in middle

#### CSS Keyframes
```css
@keyframes flyCardA {
    0% { /* Start at fromSeat */ }
    50% { /* Peak above center, crossing point */ }
    100% { /* Land at toSeat */ }
}

@keyframes flyCardB {
    0% { /* Start at toSeat */ }
    50% { /* Peak below center, crossing point */ }
    100% { /* Land at fromSeat */ }
}
```

Duration: 600ms with bounce easing

---

## Feature 3: Drag-and-Drop Actions

### Requirements
- Your drink card (🎴) is draggable
- Tap/click on card = drink action
- Drag card to another player = swap action
- Visual drop zones on valid targets
- Touch-friendly for mobile
- Buttons available as secondary fallback

### Implementation

#### Interaction Detection
- Track `dragStartTime` to distinguish tap vs drag
- `DRAG_THRESHOLD = 10px` - movement needed to start drag
- `TAP_THRESHOLD = 200ms` - max time for tap
- If moved < threshold AND time < threshold → tap → drink
- If moved > threshold → drag → find drop target → swap

#### Drag State
```typescript
const [isDragging, setIsDragging] = useState(false);
const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
const [dragTarget, setDragTarget] = useState<number | null>(null);
```

#### Touch Handlers
- `handleDragStart` - record start position/time
- `handleDragMove` - update position, detect threshold, find drop target
- `handleDragEnd` - execute action based on tap vs drag

#### Drop Zone Detection
`findDropTarget(x, y)` checks distance to each valid swap target:
- `MAGNET_DISTANCE = 60px` - snap radius
- Returns seat number if within range, null otherwise

#### Visual Feedback
- Dragged card follows touch/mouse with `position: fixed`
- Drop zones appear on valid targets with pulsing dashed border
- Hovered drop zone glows gold
- Small hint text: "Tap to drink" / "Drop to swap"

#### Minimal Action Tray
Keep buttons but make smaller and less prominent:
- Reduced padding and font size
- More transparent background
- Secondary visual treatment

---

## Implementation Order

### Phase 1: Rematch Voting System
1. `shared/src/constants.ts` - Add message types
2. `shared/src/schemas.ts` - Add Zod schemas
3. `server/src/room.ts` - Voting logic
4. `server/src/index.ts` - Message handlers
5. `client/src/lib/ws.ts` - Client methods
6. `client/src/stores/gameStore.ts` - Vote state
7. `client/src/app/game/[code]/page.tsx` - Voting UI
8. `client/src/app/game/[code]/page.module.css` - Voting styles

### Phase 2: Card Swap Animation
1. Position calculation helper
2. Animation state management
3. Flying card overlay component
4. CSS keyframe animations
5. Wire to swap events
6. Test and polish timing

### Phase 3: Drag-and-Drop Actions
1. Drag state and refs
2. Touch/mouse event handlers
3. Tap vs drag detection
4. Drop zone rendering
5. Target detection logic
6. Secondary button styling
7. Mobile touch testing

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/src/constants.ts` | Add 4 new message types |
| `shared/src/schemas.ts` | Add 4 new Zod schemas |
| `server/src/room.ts` | Add voting state, modify game end flow |
| `server/src/index.ts` | Add vote/leave handlers |
| `client/src/lib/ws.ts` | Add vote/leave methods, handle new messages |
| `client/src/stores/gameStore.ts` | Add voting state |
| `client/src/app/game/[code]/page.tsx` | Voting UI, swap animation, drag-drop |
| `client/src/app/game/[code]/page.module.css` | All new styles |

---

## Estimated Complexity

- **Feature 1 (Voting)**: Medium - Server state + UI
- **Feature 2 (Swap Animation)**: Medium - Position math + CSS animations
- **Feature 3 (Drag-Drop)**: High - Touch handling + interaction detection
