# ⚓ Cannonball Cove

A pirate-themed physics siege game — pull back the cannon, let fly, and sink
every scallywag on the enemy ship. Pure HTML5 canvas + vanilla JavaScript,
no dependencies, no build step.

## Play it

Just open `index.html` in any modern browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Works with mouse or touch.

## How to play

- **Drag anywhere, pull back, release** — the cannon fires like a slingshot.
  Pull farther for more power; a dotted arc previews your shot.
- **Tap (or press Space) while a special shot is flying** to trigger its power.
- Eliminate **every pirate** on the enemy ship to win the level.
- Unspent cannonballs earn a **750-point bonus** each — win efficiently for 3 stars!

### Ammo types

| Ammo | Power |
| --- | --- |
| ⚫ Cannonball | Reliable iron. Smashes wood and knocks pirates overboard. |
| 🍇 Grapeshot | Tap mid-flight to split into 3 shots — great vs spread-out crews. |
| 💣 Bombshell | Tap mid-air to detonate (also blows on hard impact). Lob it over walls! |
| 🐙 Kraken Ball | Huge and heavy. Crushes straight through stone fortifications. |

### Things on ships

- **Wood planks, posts & crates** — breakable, stackable, collapsible.
- **Stone blocks** — tough; bring bombs or the Kraken Ball.
- **Red TNT barrels** — shoot them for glorious chain reactions.
- **Floating treasure chests** — clip one with a shot for +500 gold.
- **The Captain** — bigger, tougher, and worth double. Send him swimming.

## Levels

1. **First Blood** — learn the ropes.
2. **Powder Keg** — meet the TNT barrel.
3. **Grapeshot Alley** — split shots vs a two-deck ship.
4. **Iron Sides** — bomb your way past stone walls.
5. **The Flagship** — everything at once.
6. **Davy Jones' Door** — the Captain awaits.

Progress (stars & best scores) is saved in your browser via `localStorage`.
Levels unlock in order.

## Tech notes

- Custom impulse-based 2D rigid-body physics engine (rotating boxes + circles,
  SAT collision with contact clipping, friction, restitution, positional
  correction) — in the style of Randy Gaul's *Impulse Engine*.
- Impact-based damage model, radial explosions with falloff, buoyancy-free
  "sink and splash" water.
- All art drawn procedurally on canvas; all sound synthesized with WebAudio.

## Controls

| Input | Action |
| --- | --- |
| Drag + release | Aim & fire |
| Tap / Space | Trigger special shot ability |
| R | Restart level |
| M | Mute |
