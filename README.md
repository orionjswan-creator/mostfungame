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
- **They shoot back!** Enemy bow chasers lob cannonballs (red-ringed) at your
  ship — watch your **hull bar**. If it hits zero, you're sunk. Every pirate
  you eliminate thins the gun crew and slows their rate of fire. Below 70%
  hull your ship starts smoking; below 30% she's burning — finish the fight!
- Levels 13-18 also **shrink your maximum hull** (down to 65 on the finale),
  so there's even less margin for a stray hit.
- Unspent cannonballs earn **+750 each** and surviving hull earns up to
  **+400** — win fast and clean for 3 stars!

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
- **Bow-chaser mortars** — the enemy's return fire. Later ships shoot faster,
  aim better, and mount two guns.

## Levels

1. **First Blood** — learn the ropes.
2. **Powder Keg** — meet the TNT barrel.
3. **Grapeshot Alley** — split shots vs a two-deck ship.
4. **Iron Sides** — bomb your way past stone walls.
5. **The Flagship** — everything at once, twin bow chasers.
6. **Davy Jones' Door** — the Captain awaits.
7. **Ironclad Reef** — stone casemates shelter the crew.
8. **Twin Terrors** — two ships, guns on both.
9. **The Kraken's Court** — a stone fort, chained barrels, and the Kraken Captain.
10. **Blood Moon Armada** — two hulls, two independent guns, split fire.
11. **The Widowmaker** — twin fast guns behind a reinforced double-stone hull.
12. **Storm Armada** — two ships, four guns, relentless barrage.
13. **Skull Bay Ambush** — reduced hull (90), four guns, no room for waste.
14. **The Bonewall** — a triple stone casemate wall with three guns of its own.
15. **Crimson Tide** — twin hulls, a Captain aloft, hull down to 80.
16. **The Devil's Broadside** — two fortresses, two Captains, four fast guns.
17. **Maelstrom** — three ships, five guns, hull down to 72.
18. **The Last Stand** — the true finale: three ships, six guns, 65 hull. Fear them.

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
