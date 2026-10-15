
A pixel-art Roguelike tactics game built with native HTML / CSS / JavaScript and Three.js, requiring no build tool.

- Source download: <https://github.com/m0n3rt/Pixel-Tactics-War/releases/download/v1.0.3/Pixel-Tactics-War-v1.0.3.zip>
- Online demo: <https://m0n3rt.github.io/Pixel-Tactics-War/?v=1.0.3>


## Game Overview

- **Mode**: PVE — Player versus progressively stronger enemy AI
- **Flow**: Difficulty Selection → Route Map → Events → Deployment Battle → Rewards/Shop → Boss Battles → Victory
- **Map**: 10 maps with multiple selectable nodes
- **Node Types**: Battle, Elite Battle, Random Event, Camp Shop, and Boss Battle
- **Victory Condition**: Complete the route and defeat the final Boss

### Main Systems

- **Difficulty levels**: 1–10. Enemy and Boss bonuses increase with difficulty; higher levels add enemy tower support from Map 3.
- **Route map**: Choose the next reachable encounter, balancing risk and rewards.
- **Battle rewards**: Pick one random blessing after battles to improve attack, HP, speed, deployment points, unit capacity, or a unit type.
- **Random events**: Choose between event branches to gain resources, blessings, or risks.
- **Camp shop**: Spend gold on relic chests, restore HQ health, or trigger one challenge dice roll.
- **Relics**: Relics provide persistent effects, battle triggers, and special mechanics. The stats panel shows active blessings and relic stacks.
- **Boss battles**: Boss encounters use dedicated pools and difficulty bonuses.

---

## Core Parameters

| Parameter | Value |
|---|---|
| Board Size | 14 columns × 8 rows (32px pixel grid) |
| HQ Zones | 2 columns on each side (castle rendered in canvas) |
| Battlefield | Middle 10 columns (column indices 2 ~ 11) |
| Player Deploy Zone | Left 3 columns (column indices 2 ~ 4) |
| Enemy Deploy Zone | Right 3 columns (column indices 9 ~ 11, AI generated) |
| HQ Initial HP | 100 |
| Preparation Time | 60 seconds |
| Deploy Points per Round | 20 |

---

## Unit Types

| Unit Type | Character | Cost | HP | Attack | Range | Move CD | Attack CD | Shape |
|---|---|---|---|---|---|---|---|---|
| Infantry | 步 | 1 | 12 | 3 | 1 | 0.6s | 0.9s | Square |
| Archer | 弓 | 2 | 8 | 3 | 3 | 0.8s | 1.2s | Diamond |
| Tank | 甲 | 3 | 25 | 4 | 1 | 1.0s | 1.0s | Double Square |

- Each unit has **independent movement/attack cooldown timers**.
- When out of range, units move toward the nearest enemy at movement intervals (prioritize horizontal direction; try the other axis if main direction is blocked).
- When in range, automatically attack at attack intervals.
- **No overlapping in the same cell** (collision prevention movement system).

---

## Battle Rules

1. **Round Settlement**: A round ends when all units of one side are eliminated.
2. **HQ Damage**: The remaining units of the winning side apply damage equal to **the sum of their max HP × 50%** to the enemy headquarters.
3. **HP Clamping**: HQ HP will not go below 0; both UI values and health bars are clamped.
4. **HQ Destruction**: When HP reaches zero, trigger explosion effect (massive flames + smoke particles). The castle becomes a ruin state (collapsed walls + continuous smoke animation + fallen flag + "DESTROYED" label).
5. **Game Over**: Either HQ HP reaches zero → displays "Play Again" / "Back to Home" buttons.

---

## UI & Interactions

### Game Flow Screens

| Screen | Description |
|---|---|
| Home | Title gradient animation + floating sword icon + "Start Game" button |
| Difficulty Selection | Levels 1–10, enemy/Boss bonuses, and special mechanics |
| Route Map | Map progress and selectable battle/event/shop/Boss nodes |
| Random Event | Event description and branching choices |
| Camp Shop | Relic chests, HQ healing, and challenge dice |
| Blessings/Relics | Overview of all active bonuses and relic stacks |
| Loading | Spinning spinner + "Preparing Battlefield...", 1.2 seconds |
| Round Banner | "Round N" pop-up with scale animation, 1.8 seconds |
| Preparation | Chessboard + deploy operations + 60-second countdown |
| Auto Battle | Units automatically move/attack + particle effects |
| Round Settlement | Battle results + "Next Round" button |
| Game Over | "Play Again" / "Back to Home" |

### Top Status Bar

- **Left**: Player HQ HP panel (value + green gradient health bar)
- **Right**: Enemy HQ HP panel (value + red gradient health bar)
- **Center**: Phase badge (Preparation / Battle / Settlement, different colors), round number, countdown, deploy points, real-time army summary (Infantry×N Archer×N Tank×N)

### Canvas Rendering

- **HQ Castle**: Pixel-art castle building that progressively damages as HP decreases:
  - HP > 70%: Perfect state
  - HP 40~70%: Cracks appear
  - HP 15~40%: Missing crenellations + many cracks + debris
  - HP = 0: Ruin state (collapsed walls + scorch marks + continuous smoke + fallen flag + DESTROYED label)
- **Floating Banner**: Dynamic flag on castle roof (sine wave animation)
- **Hit Flash**: Red flashing overlay when HQ is hit
- **Unit Rendering**: Each unit type with unique shape + type character (步/弓/甲) + faction border (green=player/red=enemy) + health bar
- **Three.js View**: 3D battlefield, unit and HQ models, camera zoom, rotation, and reset controls
- **Deploy Zone**: Player's zone pulses with highlight during preparation phase + "Player Zone"/"Enemy Zone" text labels
- **Hover Highlight**: Border highlight on mouse-hovering cell

### Right Side Battle Log

- Side panel of 180px width on the right, same height as canvas
- Displays battle records in real-time scrolling, retains up to 60 entries
- Color-coded: Attack (red) / Kill (orange) / System Message (blue)

### Particle System

| Particle Type | Purpose |
|---|---|
| `proj` (Projectile) | Remote attack trajectory |
| `spark` (Spark) | Unit death debris, HQ hit effect, explosion flames |
| `smoke` (Smoke) | Explosion smoke after HQ destruction, floats upward and fades |

### Unit Hover Tooltip

When hovering over any unit, a floating information card displays:
- Faction (Player / Enemy, color-coded green/red)
- Unit type name, HP / Max HP, Attack, Range, Move CD, Attack CD

---

## Controls

### Mouse Operations

| Operation | Effect |
|---|---|
| Click empty deploy zone | Place current selected unit type (costs points) |
| Click own placed unit | Remove unit and return points |
| Hover over unit | Display detailed properties in tooltip |
| Click bottom unit buttons | Switch selected unit type |

### Keyboard Shortcuts

| Key | Phase | Effect |
|---|---|---|
| `1` / `2` / `3` | Preparation (not paused) | Select Infantry / Archer / Tank |
| `Space` / `Enter` | Preparation (not paused) | Start Battle immediately |
| `P` | Preparation + Battle | Pause / Resume |
| `+` / `=` | Battle | Toggle battle speed 1× / 2× / 3× |
| `Space` / `Enter` | Settlement | Enter Next Round |

### Pause System

- Both **Preparation Phase** and **Battle Phase** can be paused (button + keyboard `P`)
- When paused: countdown freezes, battle freezes, **unit deployment is prohibited**
- Pause dialog (rounded card + frosted glass background) contains:
  - **▶ Resume** — Resume the game
  - **✕ Quit** — Display secondary confirmation dialog ("Confirm Exit" / "Cancel"), returns to home screen upon confirmation

### Battle Speed Control

- During battle phase, toggle **1× / 2× / 3×** speed in the bottom bar

### 3D Camera

- Drag to rotate the view and use the mouse wheel to zoom.
- Click “Reset Camera” to restore the default angle.
- Click “Zoom” to adjust the battlefield distance.

---

## File Structure

```
Pixel-Tactics-War/
├── index.html      # Page structure and game entry point
├── style.css       # Styling and responsive layout
├── src/            # Modular game logic (data, state, combat, flow, and Three.js view)
├── vendor/         # Three.js and OrbitControls
├── relics.json     # Relic configuration
├── PureHtml/       # Single-file HTML backup
├── backup/         # Refactoring helper scripts and exports
├── package.json    # Optional local server configuration
├── README.md       # Chinese version documentation
├── README_EN.md    # English version documentation (this file)
└── LICENSE         # Apache 2.0 License
```

---

## How to Run

### Open Directly in Browser (Recommended)

No dependencies required. Simply double-click `index.html`.

Alternatively, right-click `index.html` in VS Code → "Open With Live Server".

### Using Local HTTP Server (Optional)

```pwsh
cd Pixel-Tactics-War
npm run serve
```

You can also open `index.html` directly or use Live Server in VS Code. All runtime dependencies are included in the repository, so `npm install` is not required.

---

## Current Version

- **Version**: v1.0.3
- **Source package**: [Download v1.0.3](https://github.com/m0n3rt/Pixel-Tactics-War/releases/download/v1.0.3/Pixel-Tactics-War-v1.0.3.zip)
- **Online demo**: [GitHub Pages](https://m0n3rt.github.io/Pixel-Tactics-War/?v=1.0.3)
- **Release history**: [GitHub Releases](https://github.com/m0n3rt/Pixel-Tactics-War/releases)

---

## Future Expansion Ideas

- More unit types (Healer, Artillery, Summoner, etc.)
- Terrain system (grass slows, high ground increases attack, etc.)
- Pixel art assets and frame animations (walking, attacking, idle)
- Sound effects and BGM
- Difficulty selection
- Roguelike mechanics with shop system
- Achievement system

---

## License

Licensed under Apache License 2.0. See [LICENSE](LICENSE) file for details.
