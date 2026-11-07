# Tabletop Golf — Design Lab

A web app for designing, playing, simulating and **optimizing** a tabletop golf game, where every tunable number is a **discrete value that can be printed on a card, a token, a die table, a ruler or a template**. Whatever the app finds to be balanced must be buildable as a physical board game, with no computer at the table.

**Play it:** open [`prototype/game.html`](prototype/game.html) for the playable **retro pixel-art** game. It supports 1–4 players, each human or CPU, over 3, 6 or 9 random holes.
- **Look:** the course is drawn at low resolution and scaled up with hard pixel edges, with pixel fonts, square pixel balls and dice.
- **Your bag** is a hand of pixel-art club cards at the bottom of the screen, Balatro-style. Each card shows its tier's frame colour (Bronze → Diamond), distance and accuracy. Tap a card to pick that club; cards you can't use from your lie go dark.
- **Gamble meters:** next to the tumbling dice, each roll has a pixel number line. Every outcome is as wide as its chance, so 7 is wide and 2 or 12 are slivers, coloured short / middle / long. Direction uses the six faces with their angles, and putting shows the IN numbers against the misses. Once the dice land, a gold arrow points at the result.
- **Club cards:** the tier shows as the card's background (Bronze, Silver, Gold, Emerald or Diamond pixel stripes), with no border and no label. The distance strip shows the 2d6 totals 2–12 and the direction strip the faces 1–6, numbered inside each coloured box. A ★ means a joker is boosting that club.
- **Pro shop (Balatro-style):** after each hole, every human player gets 3 club upgrade cards (sometimes one on SALE) and 2 **jokers or tickets**. They can REROLL for $1, and sell jokers back for half price. CPU players shop on their own.
- **Jokers** (passive, 3 slots) and **tickets** (one use, 2 slots), shown next to your hand. See 2.9.
- **Camera:** it follows the ball. It frames your ball, the flag and your shot's reach, so it tightens as you get closer, and it zooms onto the green for putts.
- **Long shots:** pick a club (tap its card or its mark on the bag ruler; the Driver also has 25–100% power marks), tap the board to aim, then roll. The dice tumble, the rolled fan line lights up, and the ball flies there. (`clubs-v2` branch; `main` still uses the v1 power ruler.)
- **Greens:** the board zooms in and you pick SAFE or RISKY on your putter card.
- **Turn order:** the player furthest from the cup goes next.
- **Coins:** gold coin tokens sit on the course, and stopping on one picks it up.
- **Between holes:** a scorecard, coins for score, and an upgrade shop on each player's bag.

**Prototype:** a working no-install prototype lives in [`prototype/`](prototype/). Open `prototype/index.html` in a browser. It covers play, the hole editor, the rules config, bot simulation, parameter sweeps and upgrade-value measurement. Run `node prototype/test-engine.js` for the engine tests.

This README is the full brief for building the app with Claude Code. Section 2 is the game itself and is the source of truth for the rules engine; everything after it describes the app.

---

## 1. Goals

1. **Play**: lay out a hole freely (drag felt-like shapes), then play it shot by shot exactly as you would on a table.
2. **Tweak**: every rule number lives in one config. Each one is edited on a **discrete step** (for example, distance per pip in steps of 1 yard, angles in whole degrees, multipliers in steps of 0.05) so it always maps to something printable.
3. **Simulate**: play thousands of holes with bot golfers to measure how the config behaves.
4. **Optimize**: search the discrete parameter space for configs that hit targets (average score near par, upgrades worth their cost, hazards that matter but don't dominate, sensible game length).
5. **Print**: export the physical components (ruler, angle fan, club cards, lie cards, putting card, upgrade track, tokens) generated from the current config.

Non-goals for v1: online multiplayer, accounts, 3D graphics.

---

## 1b. Design direction (decided)

| Question | Decision |
|---|---|
| Overall feel | **Light golf sim**: recognisably golf (club choice, lies, hazards) but quick, dice-driven and forgiving |
| Shot randomness | **2d6 distance zone + 1d6 direction** (as in 2.3) |
| Clubs | **A full bag of 12 cards, from Driver to Sand Wedge plus Putter** (see 2.0). Each club hits one fixed distance |
| Power | **Only the Driver has power levels** (25 / 50 / 75 / 100%). Every other club is always a full swing |
| Upgrades | **Upgrading a club improves its odds**, not its distance: more of the dice results land on target and go straight |
| Simplicity | **As few numbers on cards as possible.** It must play smoothly as a real board game; distances live on one shared ruler, odds are shown as coloured strips |
| Lie penalty | v1: a power cap (rough max 75%, bunker and trees max 50%). v2 needs a new rule because most clubs have no power levels (see 2.0, open questions) |
| Roll after landing | **None**: the ball stops dead where it is measured |
| Trees | **Block the shot line**: if the line crosses trees, the ball stops at the tree edge (see 2.3) |

---

## 2. The game (rules engine source of truth)

> **Two club systems.** Section **2.0** is the **club system v2**, the target for the board game. On the **`clubs-v2` branch** the engine, the game, the design lab and the printable kit all run v2. Sections 2.3–2.6 and 2.8 describe **v1** (4 clubs, every club has 25–100% power, tiers add distance), which is still what `main` runs.

### 2.0 Club system v2 (built on the `clubs-v2` branch)

**Goal:** this must play smoothly as a real board game, so the cards carry as few numbers as possible and nobody does maths at the table.

**The bag: 12 clubs plus the Putter, one card each**

| Card | Swing | Distance (proposed) |
|---|---|---|
| Driver | **25 / 50 / 75 / 100%** (the only club with power levels) | 250 yd at 100% (about 60 / 125 / 190 / 250) |
| 3-Wood | full swing only | 220 |
| 5-Wood | full swing only | 200 |
| 4-Iron | full swing only | 180 |
| 5-Iron | full swing only | 170 |
| 6-Iron | full swing only | 160 |
| 7-Iron | full swing only | 150 |
| 8-Iron | full swing only | 140 |
| 9-Iron | full swing only | 130 |
| Pitching Wedge | full swing only | 115 |
| Sand Wedge | full swing only | 90 |
| Lob Wedge | full swing only | 40 |
| Putter | green only | rings (2.7) |

- **Choosing a club is the distance decision.** Instead of picking a power level, you pick the club whose distance fits the shot. Only the Driver keeps a power choice, for tee shots that need to be shorter.
- **Distances are not printed on the cards.** One **shared bag ruler** (1 mm = 1 yd) has a named mark for every club (and D25 / D50 / D75 / D100 for the Driver). The ruler has notches every 10 yd: a **short** result is one notch before the club's mark, and a **long** result is one notch past it (proposed).

**One shot**
1. Pick a club card (the Driver also picks a power level).
2. Aim the shared fan, then roll 2d6 (distance) and 1d6 (direction) together.
3. **Distance:** look up the 2d6 total on the card's **distance strip**: short, on target or long. Then measure on the bag ruler.
4. **Direction:** look up the d6 on the card's **direction strip**: straight, slight or wide. Then use that line on the shared fan.

**What a card shows (and nothing else)**
- The club's name and pixel-art picture.
- Its tier: the frame colour (Bronze → Diamond) and pips.
- A **distance strip**: 11 small boxes for the 2d6 totals 2–12, coloured **short / on target / long**.
- A **direction strip**: the 6 die faces, coloured **straight / slight / wide**.

**The shared fan** has just 5 lines: wide left, slight left, straight, slight right, wide right (proposed ±15° and ±6°). It's the same for every club; only the cards change which die faces go where.

**Upgrades improve the odds** (proposed). Each upgrade swaps in the next tier's card for that club, and alternates between better distance and better direction:

| Tier | Distance strip (2d6): short / on target / long | Direction strip (d6): wide / slight / straight |
|---|---|---|
| 1 Bronze | 2–4 / **5–9** / 10–12 (on target 67%) | 1, 6 wide · 2, 5 slight · 3, 4 straight |
| 2 Silver | 2–3 / **4–10** / 11–12 (83%) | same as tier 1 |
| 3 Gold | same as tier 2 | no wide: 1, 2, 5, 6 slight · 3, 4 straight |
| 4 Emerald | 2 / **3–11** / 12 (94%) | same as tier 3 |
| 5 Diamond | same as tier 4 | 1, 6 slight · 2–5 straight |

- Each tier makes good results **more likely**; the club never hits further.
- The **shop** sells next-tier cards (Balatro-style, as in the game prototype).
- A full set is 12 clubs × 5 tiers = **60 club cards**, plus the putter cards.

**Kept from v1:** the course pieces, trees blocking the shot line, water and out of bounds penalties, ring putting on green tiles (2.7), and coins (score plus coin tokens).

**Decided after testing:**
- **Bag size:** the full bag is used. A **Lob Wedge** was added for short shots.
- **Lies:** from the rough the result **drops one step** (long → on target → short). From a bunker or the trees it drops **two steps**.
- **Where each club can be played from:**
  - Woods: tee, fairway or rough.
  - 4- to 8-iron: also from the trees.
  - 9-iron and the wedges: from anywhere except the green, including bunkers.
- **Lob Wedge distance: 40 yd** (30 / 40 / 50). At 50 yd, its short result (40) was still too long for a ball 15–25 yd from the cup but off the green: bots flew over the green and back until they hit the stroke limit on 2.3% of holes. At 40 yd that drops to 0.7%.

**How it plays** (bots, 300 random holes): about **+0.7 over par per hole**, against about +0.4 for v1. The short game is still the hardest part, because the shortest result is 30 yd.

**Built on the `clubs-v2` branch:**
- **Engine:** all 12 clubs, Driver-only power, tier strips, lie drops; tests cover every rule.
- **Game:** a 13-card hand, the shared bag ruler (tap a club's mark), and meters that include the lie drop.
- **Design lab:** editors for the tier strips, the notch and the lie drops.
- **Printable kit:** the shared bag ruler, the shared 5-line fan, one card per club per tier (no distance numbers), and a two-column player board.

**Still open:**
- **Very short shots:** whether a chip rule is still needed under 30 yd.
- **Notch size:** whether short and long should be one notch (10 yd) for every club, including the Driver.
- **Balance:** whether v2 should be made a bit easier.

### 2.1 Scale and table

| Thing | Value | Notes |
|---|---|---|
| Long-game scale | 1 cm = 10 yards | A 400-yard par 4 is 40 cm of table |
| Putting scale | 1 cm = 1 yard | Used only once the ball is on the green |
| Engine unit | 1 unit = 1 yard | The app works in yards; print scales convert |
| Default board | 340 × 460 yards | 34 × 46 cm at long-game scale; configurable |

### 2.2 Pieces on the table

All pieces are freely placed shapes. v1 uses ellipses (centre, radius x, radius y, rotation); v2 may add polygons or blobs drawn as splines.

| Piece | Effect | Physical form |
|---|---|---|
| Tee | Start point | Small card |
| Fairway | Normal lie | Light green felt |
| Rough | Everything with no piece on it (bare table) | — |
| Green | Putting surface: a **green tile** with the cup and putting rings printed on it (2.7) | Printed tile |
| Pin | The cup's position is fixed on the green tile | Flag on the tile |
| Bunker | Sand lie | Tan felt |
| Water | Penalty and drop | Blue felt |
| Trees | Trees lie | Tree token on a dark felt base |
| Out of bounds | Anything off the board edge | Table / mat edge |

**Lie when shapes overlap** is a config rule (`rules.lieMode`):
- `stacking` (prototype default): the piece **on top** decides the lie, as with real felt on a table. A green laid on top of water is an island green.
- `priority`: first match wins in `water > bunker > trees > green > fairway > rough`. Under this rule an island green cannot be built from ellipses: the prototype's island par 3 became unplayable (every bot hit the stroke cap).

Off-board is checked first and is `ob`.

**Par** is derived from the straight-line tee-to-pin distance unless set manually: `< 250 yd → par 3`, `< 470 yd → par 4`, otherwise `par 5`. The thresholds are config values.

### 2.3 A long-game shot (v1, current prototype)

1. **Aim**: the player picks any aim point. The angle fan is laid at the ball with its centre line through that point. The default aim is the pin.
2. **Choose club and power**: 25%, 50%, 75% or 100%, up to the lie's cap (2.5).
3. **Distance roll**: roll 2d6 to pick a zone: **2–4 short (×0.9, 17%)**, **5–9 middle (×1.0, 67%)**, **10–12 long (×1.1, 17%)**. `distance = clubFull(tier) × power × zone`, rounded to `rulerStepYd` (1 yd).
4. **Direction roll**: roll 1d6. The face picks a line on the fan for the club's current tier: `angle = fan[tier][face − 1]` degrees (negative = left).
5. **Measure** `distance` along the line at `angle` from the aim line, and place the ball there. No further randomness, no roll.
   - **Trees block the line** (`rules.treesBlockLine`, default on): if the line passes through trees before the end point, the ball stops where it first enters the trees, and its lie is `trees`. Trees the ball starts in are ignored until it leaves them.
6. **Resolve the landing spot**:
   - `ob`: +1 penalty stroke; the ball returns to where the shot was played from.
   - `water`: +1 penalty stroke; walk back along the shot line toward the start until the point is no longer in water (step 1 yard) and drop there.
   - Anything else: the ball stays; the new lie is whatever it is sitting on.

A stroke is counted for every shot, plus penalties.

### 2.4 Clubs (v1, current prototype)

`full` is the middle-zone distance at 100% power, tier 1. Each tier above 1 adds the tier bonus.

| Club | Full (yd) | Bonus per tier | Tier 5 full | At 100%: short / middle / long (T1) | Allowed lies |
|---|---|---|---|---|---|
| Driver | 250 | +10 | 290 | 225 / 250 / 275 | tee only |
| Wood | 210 | +10 | 250 | 189 / 210 / 231 | tee, fairway, rough |
| Iron | 160 | +5 | 180 | 144 / 160 / 176 | all except green |
| Wedge | 90 | +5 | 110 | 81 / 90 / 99 | all except green |
| Putter | — | — | — | see 2.7 | green only |

`distance = (full + (tier − 1) × tierBonus) × power × zoneMultiplier`. Iron at 50% is 72 / 80 / 88; at 25% it is 36 / 40 / 44.

### 2.5 Lies (v1, current prototype)

The only distance penalty for a lie is a **cap on power**:

| Lie | Max power | Extra rules |
|---|---|---|
| Tee | 100% | Only place the Driver may be used |
| Fairway | 100% | — |
| Rough | **75%** | — |
| Bunker | **50%** | Iron or Wedge only |
| Trees | **50%** | Iron or Wedge only; shot lines that cross trees stop at their edge |
| Green | — | Putter only |
| Water / out of bounds | — | +1 stroke (see 2.3) |

### 2.6 Angle fan by tier (v1, current prototype; degrees per direction-die face 1–6)

| Tier | Face 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 1 | −15 | −6 | 0 | 0 | +6 | +15 |
| 2 | −12 | −5 | 0 | 0 | +5 | +12 |
| 3 | −9 | −4 | 0 | 0 | +4 | +9 |
| 4 | −6 | −2 | 0 | 0 | +2 | +6 |
| 5 | −4 | 0 | 0 | 0 | 0 | +4 |

The physical fan template prints one line per **distinct** angle, labelled with the die faces it covers.

### 2.7 Putting: rings on flat green tiles

Greens are **flat tiles** with **4 rings drawn around the cup**. There's no measuring on the green: the ring the ball sits in sets the putt.

**Green tiles** (1 mm = 1 yd; ring radii in yards):

| Tile | Difficulty | Ring 1 / 2 / 3 radius | Notes |
|---|---|---|---|
| Round | ★ | 5 / 10 / 15 | Cup in the centre |
| Big oval | ★ | 5 / 11 / 17 | Cup in the centre |
| Long & narrow | ★★ | 4 / 8 / 13 | Cup near one end |
| Banana | ★★ | 4 / 9 / 14 | Curved; cup in one end |
| Dogleg | ★★★ | 4 / 8 / 13 | L-shaped; cup at the top of the narrow arm |
| Peanut | ★★★ | 3 / 7 / 11 | Cup in the small lobe |
| Small round | ★★★ | 3 / 6 / 10 | Cup off-centre |

Ring 4 is the rest of the green. Harder tiles have smaller rings and the cup near an edge, so approaches finish further out.

**Each putt, choose SAFE or RISKY, then roll 2d6.** The number or more puts the ball in.

| Ball in… | SAFE: in on… | SAFE miss → | RISKY: in on… | RISKY miss → |
|---|---|---|---|---|
| Ring 1 | 3+ (97%) | stays in ring 1 | — (tap-in, SAFE only) | — |
| Ring 2 | 11+ (8%) | **ring 1** | 7+ (58%) | **ring 2** |
| Ring 3 | 12 (3%) | **ring 1** | 9+ (28%) | **ring 2** |
| Ring 4 | can't go in | **ring 2** (long putt) | 11+ (8%) | **ring 2** |

- **SAFE**: small chance to hole it, but you end up close (ring 1, or ring 2 from the edge).
- **RISKY**: much better chance to hole it, but a miss rolls past the cup into ring 2.
- **Putter tiers alternate**: tiers 2 and 4 make every RISKY number 1 lower, and tiers 3 and 5 make every SAFE number 1 lower. At tier 5, ring 1 is automatic, RISKY needs 5+ / 7+ / 9+ and SAFE needs 9+ / 10+ / 11+ from rings 2 / 3 / 4.

**Balance** (expected putts, best choice, from the simulator):
- **Tier 1:** 1.03 / 1.71 / 2.00 / 2.57 from rings 1–4. RISKY is best from rings 2 and 4, SAFE from ring 3.
- **Close calls:** the choice in ring 3 stays close through tier 3, and ring 4 is a real gamble at every tier.
- **Tiles:** easy tiles play about +0.2 per hole, medium about +0.4, hard +0.6 to +0.8. Hard tiles average about 1.8 putts against 1.65–1.7 on the others.

A long shot that finishes within `cupRadius` (1 yd) of the cup is holed.

### 2.8 Progression (tiers and upgrades; v1 tiers add distance, v2 tiers improve odds, see 2.0)

- Every club, including the Putter, has a tier from **1 to 5**; all start at tier 1.
- **Each upgrade improves both distance and accuracy**: the club gains its `tierDistanceBonus` (yards per tier above 1, see 2.4) and uses the next, narrower fan (2.6). Putter upgrades alternate: RISKY numbers 1 lower at tiers 2 and 4, SAFE numbers at tiers 3 and 5 (2.7).
- Coins come from two sources:
  - **Score:** birdie or better 5, par 3, bogey 2, worse 1 (raised so players can afford jokers and rerolls, see 2.9).
  - **Coin tokens on the course:** each hole has **3 tokens** (3 cm discs) placed just outside water, bunkers or trees, or near the board edge, never on the green. A token is worth **2** if it sits next to water or the edge, otherwise **1**. If your ball **stops on a token** (within 15 yd), you take it; first come, first served.
  - **Balance:** tokens add about 0.46 coins per player per hole on top of about 2 from score, roughly +25%. Bots that chase them lose about 0.2 strokes per hole, so going for a coin is a real gamble. A 10 yd radius gave only 0.2 coins. A "shot line touches the token" rule gave as many coins as 15 yd but cost nothing, so it wasn't a gamble.
- Upgrade costs: **1 / 2 / 2 / 3** coins (8 to max one club). With about 2.25 coins per player per hole, that's more than one upgrade per hole: about 9 in a 6-hole game and a full bag by about hole 18. In the game, upgrades are bought as cards from the pro shop: 3 offers per hole, sometimes one on sale, and $1 rerolls.
- Physical form: each player has one **player board** (each club's picture and 5 empty squares, Bronze → Diamond) to mark tiers. Upgrading = marking the next square and swapping in that tier's ruler and fan.

---

### 2.9 Jokers and tickets (built in the game, `clubs-v2` branch)

Special cards bought in the pro shop. **Jokers** are passive and work every shot; a player holds up to **3**. **Tickets** are used once and then discarded; a player holds up to **2**. Either can be sold back for half price.

| Card | Type | Price | Effect |
|---|---|---|---|
| Caddie | joker | 5 | Once per hole: flip the red die to its opposite side (1↔6, 2↔5, 3↔4) |
| Sand Shark | joker | 4 | Bunkers don't drop your result |
| Rough Rider | joker | 4 | The rough doesn't drop your result |
| Lumberjack | joker | 5 | Trees never stop your ball and don't drop your result |
| Iron Man | joker | 6 | All irons play one tier higher |
| Wedge Wizard | joker | 5 | All wedges play one tier higher |
| Big Hitter | joker | 5 | Driver and woods play one tier higher |
| Laser Putter | joker | 5 | RISKY putts need 1 less |
| Steady Hands | joker | 4 | Never WIDE: wide shots go SLIGHT instead |
| Lucky Seven | joker | 4 | Roll a 7 on the distance dice: +1 coin |
| Magpie | joker | 3 | Pick up coin tokens from twice as far away |
| Piggy Bank | joker | 4 | After each hole: +1 coin for every 4 you hold (max +3) |
| Mulligan | ticket | 2 | After seeing a roll: reroll all the dice |
| Get Out of Jail Free | ticket | 3 | Your next water or out of bounds costs no penalty stroke |

- **Timing:** Mulligan and Caddie are offered after the dice land and before the ball moves (MULLIGAN / CADDIE / PLAY IT). Get Out of Jail Free is used automatically on your next penalty.
- **Effects stack:** jokers only change their owner's rules, and boosts never go past tier 5.
- **More coins** to afford jokers and rerolls: score coins are now birdie 5, par 3, bogey 2, worse 1 (were 3 / 2 / 1 / 0), plus coin tokens and joker bonuses.

## 3. The core constraint: everything must be printable

Every config field has a **type** that defines its allowed discrete values and **how it becomes a physical component**. The editor and the optimizer may only produce values that pass these checks.

| Field type | Allowed values | Physical form | Validation |
|---|---|---|---|
| `yards` | Integer multiples of `step` (default 5) | Ruler marks and club cards | Must be readable on the ruler at the print scale (≥ 0.5 cm apart at default step) |
| `yardsPerPip` | Integer, step 1 | Club card ("+8 per pip") | 1–30 |
| `multiplier` | Step 0.05, range 0.3–1.5 | Lie card shown as a percentage ("80%") | Must be a multiple of 0.05 |
| `angleTable` | 6 integers (one per d6 face), step 1° | Fan template lines | Symmetric left/right by default; at most 5 distinct lines; outermost ≤ 30° |
| `percentTable2d6` | One value per 2d6 band, step 5% | Putting card | Bands must cover 2–12 with no gaps; at most 6 bands |
| `count` | Integer | Tokens and coins | ≥ 0 |
| `enum` / `set` | Named options | Card icons | — |
| `bool` | true / false | Rule text on a card | — |

Every field also carries `min`, `max`, `step`, `locked` (the optimizer may not change it) and `printTarget` (which component it appears on).

**Probabilities stay dice-based.** The engine never uses a continuous random number at rule level; all randomness is 1d6 or 2d6 face results, so every probability the app reports is exactly what players get with real dice.

---

## 4. Data model (TypeScript)

```ts
type Yards = number;

interface FieldMeta { min: number; max: number; step: number; locked?: boolean; printTarget: PrintTarget }
type PrintTarget = 'ruler' | 'fan' | 'clubCard' | 'lieCard' | 'puttCard' | 'upgradeTrack' | 'rulebook';

interface ClubConfig {
  id: 'driver' | 'wood' | 'iron' | 'wedge' | string;
  name: string;
  full: Yards;            // middle-zone distance at 100% power, tier 1
  allowedLies: Lie[];
  tierDistanceBonus: Yards; // per tier above 1 (defaults: Driver 10, others 5)
}

type Lie = 'tee' | 'fairway' | 'rough' | 'bunker' | 'trees' | 'green';

interface GameConfig {
  version: string;
  scale: { longCmPer10Yd: 1; puttCmPerYd: 1; rulerStepYd: number };
  powerLevels: number[];                       // [1, 0.75, 0.5, 0.25]
  clubs: ClubConfig[];
  fans: Record<1 | 2 | 3 | 4 | 5, [number, number, number, number, number, number]>;
  distanceZones: { from: number; to: number; mult: number; label: string }[]; // 2–4 ×0.9, 5–9 ×1, 10–12 ×1.1
  lieMaxPower: Record<Exclude<Lie, 'green'>, number>;                        // rough 0.75, bunker 0.5, trees 0.5
  putting: { safe: number[4]; risky: number[4]; safeMissTo: number[4]; riskyMissTo: 2; riskyBonus: number[5]; safeBonus: number[5]; cupRadius: Yards }; // 2d6 needed per ring
  penalties: { ob: number; water: number };
  par: { par3Below: Yards; par4Below: Yards };
  progression: { coins: { birdieOrBetter: number; par: number; bogey: number; worse: number }; tierCosts: [number, number, number, number] };
  meta: Record<string, FieldMeta>;            // keyed by JSON path, e.g. "clubs.1.full"
}

interface Shape { id: string; kind: 'fairway' | 'green' | 'bunker' | 'water' | 'trees' | 'tee' | 'pin'; tile?: string /* green tile id */;
  cx: Yards; cy: Yards; rx: Yards; ry: Yards; rotation: number; }

interface Course { id: string; name: string; board: { w: Yards; h: Yards }; holes: Hole[] }
interface Hole { id: string; shapes: Shape[]; parOverride?: 3 | 4 | 5 }
```

Ship a `defaultConfig.json` with exactly the values in section 2, and store every config and course as JSON (localStorage plus import/export).

---

## 5. Rules engine

Pure TypeScript, no DOM, so it runs in the UI, in Web Workers and in tests.

```
resolveShot(state, hole, config, decision, dice) -> { newState, events[] }
  decision = { club, power, aimX, aimY }
  dice     = { d1, d2, dir }          // injected, so tests and replays are deterministic
```

- **Seeded RNG**: use a small seedable generator (for example mulberry32) to produce dice. The engine itself takes dice as input.
- **Geometry**: point-in-rotated-ellipse for lie detection; polar offset for landing; a water walk-back loop with a 1-yard step.
- **Events** for the log and replays: `roll`, `land`, `penalty`, `drop`, `holed`.
- **Invariants to unit-test**: stroke counting with penalties, lie priority, OB replay from the same spot, water drop never lands in water, putts hole when within `cupRadius`, Driver only from the tee, Wood never from bunker or trees.

---

## 6. Bot golfers (needed for simulation)

The optimizer is only as good as the bots, so all configs must be scored with **the same policy set**.

**Decision policy (expected-value search):**

1. Candidate decisions: every allowed club × every power level × a set of aim points (the pin, plus points on a ring around the pin and lay-up points along the tee-pin line at 50, 100 and 150 yards from the current ball).
2. For each candidate, enumerate **all 216 dice outcomes** (36 distance × 6 direction; exact probabilities, no sampling needed) and score each landing with a value function `V(position, lie)`.
3. `V` = expected strokes to hole out from that position, from a lookup table built by simulation (first estimate by distance and lie, then refined iteratively, value-iteration style). Penalties add their strokes.
4. Pick the candidate with the lowest expected strokes. Add a `risk` parameter for profiles: risk-averse bots minimise expected strokes + λ × standard deviation.

**Profiles:**

| Profile | Behaviour |
|---|---|
| Beginner | Always aims at the pin, picks the club whose average distance is closest to the remaining distance |
| Average | Expected-value policy, λ = 0.5 |
| Expert | Expected-value policy, λ = 0 |
| Gambler | Expected-value policy, λ = −0.3 (likes risk) |

Simulation reports results per profile, so a config can be judged as "fair for beginners, rewarding for experts".

---

## 7. Simulation and metrics

Run in Web Workers (one per CPU core), with common random numbers (the same seeds) across configs being compared.

Per hole and aggregated by par:

- Average score vs par, and the full distribution (eagle … triple bogey+)
- Shots per hole and putts per hole
- Rate of OB, water, bunker and trees per hole
- Club usage share, by shot type (tee, approach, recovery)
- **Upgrade value**: change in average strokes per round when one club goes up one tier (the "coin efficiency" of each upgrade)
- Variance of score per hole (luck vs skill), and the gap between Beginner and Expert
- **Playtime estimate**: shots × seconds per shot (configurable; default 40 s per long shot including measuring, 20 s per putt)

---

## 8. Optimization

### 8.1 Search space

The user ticks which fields are free. Each free field contributes its discrete set `{min, min+step, …, max}`. Linked fields can be tied together (for example a symmetric fan, where face 1 = −face 6).

### 8.2 Objective (weighted, all configurable in the UI)

| Term | Target (default) | Weight (default) |
|---|---|---|
| Average-profile score vs par | 0 ± 0.3 per hole for each par | 5 |
| Expert minus Beginner gap | 0.6–1.2 strokes per hole | 3 |
| Hazard hit rate | 15–35% of holes touch water or bunker | 2 |
| OB rate | < 8% of tee shots | 2 |
| Each club used for ≥ 10% of its shot type | — | 1 |
| Upgrade value roughly even across clubs | Coefficient of variation < 0.3 | 2 |
| Playtime | Configurable, for example 18 holes in 60 min | 1 |

Terms are converted to penalties outside the target band, then summed.

### 8.3 Algorithms

- **Small spaces (≤ 10,000 combinations)**: exhaustive grid with successive halving (score all configs on few holes, keep the best half, double the holes, repeat).
- **Large spaces**: a Bayesian / TPE-style sampler or simulated annealing over the discrete grid, with successive halving for evaluation budgets. A plain JS implementation is fine; no Python needed.
- **Noise control**: common random numbers; report the mean ± standard error for each objective term; only accept a config as better if it wins by more than 2 standard errors.
- **Validation**: optimise on one set of courses (training), then re-score the top 5 on a different set (holdout) and show both scores. Holdout courses are generated with the random course generator (section 9) using a different seed.

### 8.4 Results UI

A table of the top configs with each objective term, a diff view against the current config ("Iron full 160 → 155, Tier 2 fan ±12 → ±10"), and an **Apply** button. Every applied config is saved to a history list for A/B comparison.

---

## 9. Course tools

- **Editor** (the core screen): drag, resize and rotate shapes on the board; snap optional (5-yard grid). Touch-friendly with pointer events.
- **Random course generator** (for simulation coverage): parameters for par mix, fairway width, number of hazards, hazard placement bias (near landing zones, greenside), dogleg angle. Every generated hole must pass checks: the pin is on the green, the tee is not in a hazard, and the hole is playable (an Expert bot can reach the green).
- **Course library**: a few hand-made reference holes (straight par 4, island-green par 3, dogleg par 5, water carry) that every optimisation always includes.

---

## 10. Screens

1. **Play**: the board, aim by tapping, club/power/tier pickers, a "Hit" button, the drawn fan and measured line per shot, and a scorecard with a dice log. It should behave like the prototype demo.
2. **Edit course**.
3. **Config**: grouped editors with discrete controls: steppers and sliders snapped to `step`, 6-face angle editors with a live fan preview, a 2d6 band editor with a probability readout (for example "6–8: 44.4%"), and lock toggles.
4. **Simulate**: pick configs, courses, profiles and number of holes; charts of scores by par, hazard rates, club usage and upgrade value.
5. **Optimize**: pick free fields and ranges, objective weights and budget; live progress; results table and diff.
6. **Print**: generate print-ready SVG (and PDF via the browser print dialog) for every component in section 11, at true scale with a calibration bar ("this bar should measure 10 cm").

---

## 11. From config to board game components

### 11.0 The shot kit: rulers, fans and a player board (prototyped, v1)

> **v2 components** (see 2.0): one shared bag ruler with a named mark per club, one shared 5-line fan, 12 club cards per tier with a distance strip and a direction strip, putter cards, green tiles, coin tokens. Per-club rulers and per-tier fans are no longer needed in v2.


**All rules information is on the rulers.** The only other printed piece is the player board, which is purely visual.

Each club has a **ruler** and a clear **fan** for each tier. A pin pushed through the ball is the shared pivot:

1. **Aim the fan**: its centre line points where you aim.
2. **Roll the direction die**: each fan line is labelled with the die faces that pick it.
3. **Swing the ruler** around the pin until its edge lies on that line.
4. **Choose a power mark** (25 / 50 / 75 / 100%) before rolling, then **roll 2d6**. Under that mark there are three ticks: **blue = 2–4 (short)**, **black = 5–9 (middle)**, **red = 10–12 (long)**. Put the ball on the ruler's edge directly above the rolled colour.

- **Club ruler** (1 mm = 1 yd, no yard numbers). It carries:
  - the power marks with colour ticks, each marked with the lies that cap power at that mark;
  - a dice key, and which lies the club can play from, with their caps (rough 75%, bunker and trees 50%);
  - the upgrade cost to the next tier;
  - a one-line how-to and the hazard rules (water +1 with a drop back along the line; off the board +1, play again; trees stop the line).
- **Tier fan**: one line per distinct angle, with die pictures at the rim; narrower each tier.
- **Putter card** (one per putter tier): read it row by row. Each row is a ring (picture + "RING n"). Under **SAFE** (blue) and **RISKY** (red), each row has two boxes: **IN on** (the 2d6 number that holes it) and **MISS →** (the ring the ball goes to). Ring 1 says "try again" (RISKY not allowed there). No upgrade information.
- **Green tiles**: the 7 tiles of 2.7, printed at true scale with rings, ring numbers, cup, flag, name and difficulty stars.
- **Coin tokens**: 3 cm gold discs (16 × 1 and 8 × 2) in `components/coin-tokens.svg`.
- **Player board** (one per player, 200 × 155 mm): each club's illustration and name with 5 empty squares (Bronze, Silver, Gold, Emerald, Diamond) to mark its tier. Nothing else.
- Generated by `prototype/components.js` from the config using the engine's distance function. Prototype **Print kit** tab: preview, SVG download, print at true size (Driver and Wood rulers need A3). `node prototype/make-components.js` writes every piece to `components/`.

| Component | Generated from | Content |
|---|---|---|
| Long-game ruler | Clubs, scale | Yard marks every `rulerStepYd`; one coloured band per club from its minimum to maximum full-power distance; the average (7 pips) marked |
| Angle fan (×5 tiers, or one fan with tier-coloured lines) | `fans` | Clear template; one line per distinct angle, labelled with the die faces it covers |
| Putting ruler | Scale | 1 cm = 1 yard |
| Putter strip (per tier) | `putting` | SAFE and RISKY number per ring |
| Green tiles | Tile library | 7 flat greens with rings, true scale |
| Player board | Clubs, tiers | See 11.0 |
| Upgrade track | Progression | Tier 1–5 per club with coin costs; a tier token per club per player |
| Coins | Progression | Token count needed for a full 18 holes |
| Hazard felt set | Course library | Templates for cutting felt pieces at true scale |
| Rule summary card | Everything | Generated text of the turn sequence with the current numbers |

**No maths at the table**: the ruler's ticks are placed at the exact distances the engine computes, so play at the table and the simulation never disagree.

**Rounding rule** (engine and print): round every computed distance to the nearest `rulerStepYd` before measuring.

---

## 12. Tech stack and structure

- Vite + React + TypeScript; Zustand for state; SVG for the board and print sheets; Recharts for charts; Vitest for tests.
- Web Workers via Comlink for simulation and optimisation.
- No backend in v1; everything in the browser with localStorage and JSON import/export.

```
src/
  engine/        rules (pure TS): geometry.ts, dice.ts, shot.ts, putt.ts, lie.ts, scoring.ts
  config/        schema.ts, defaultConfig.json, validate.ts, discretize.ts
  course/        shapes.ts, generator.ts, library/*.json
  bots/          policy.ts, valueTable.ts, profiles.ts
  sim/           worker.ts, runSim.ts, metrics.ts
  optimize/      space.ts, objective.ts, tpe.ts, annealing.ts, halving.ts
  print/         ruler.tsx, fan.tsx, clubCard.tsx, lieCard.tsx, puttCard.tsx, upgradeTrack.tsx
  ui/            Play/, EditCourse/, Config/, Simulate/, Optimize/, Print/
tests/
```

---

## 13. Build order and acceptance criteria

1. **Engine + defaults**: all rules in section 2; unit tests for the invariants in section 5. *Done when* a scripted hole with injected dice produces exactly the expected strokes and positions.
2. **Play + course editor**: matches the prototype demo. *Done when* a hole can be laid out, played to the cup, and replayed from its dice log.
3. **Config editor with discrete validation**. *Done when* no control can produce a value outside its `min`/`max`/`step`, and the fan and 2d6 previews update live.
4. **Bots + simulation**. *Done when* 10,000 holes run in under a minute on a laptop and the metrics in section 7 are shown per profile.
5. **Optimizer**. *Done when* a run with 3 free fields finds and validates a config, and the diff can be applied in one click.
6. **Print**. *Done when* a printed ruler matches its calibration bar and the club cards match the engine's distances exactly.

---

## 14. Open design questions to test with the app

**Club system v2 (2.0):**
- v2 plays about 0.3 strokes per hole harder than v1 (+0.7 against +0.4). Should the tier strips start wider, or the lie drops be softer?
- Is a chip rule still needed for shots under 30 yd?
- 13 cards per player across 5 tiers is 65 club cards for the printed game. Is that acceptable?

Each question can be tested in the prototype (see its **Guide** tab). First readings, from small runs on the 4 reference holes, so treat them as hints:

- **Tier-1 fan width**: a sweep of the outer angle (Average bot, 200 holes) gave vs-par +0.68 at ±9°, +0.83 at ±15° and +1.38 at ±21°. ±15° sits about +0.8 over par, above the 0 ± 0.3 target, so the defaults currently play hard.
- **Upgrade value (tier 1→2, measured under the old 3-tier, accuracy-only rules)**: Wood, Wedge and Putter each save about 2.2–2.7 strokes per 18 holes; Driver and Iron save almost nothing (within noise). Upgrades are uneven across clubs.
- **Bot quality**: the bots' value function is a heuristic, so the risk-averse bot can be short-sighted. On the island par 3 the Beginner outscored the Average bot. Improving `V` (for example a per-hole value grid) is needed before the optimizer can be trusted.

Original questions:

- ~~Should tiers add distance as well as accuracy?~~ Decided: yes, both, over 5 tiers (2.8). Still open: how big each step should be.
- Is ±15° at tier 1 too punishing on narrow fairways?
- Is the rough cap (75%) a big enough penalty? Is ±10% the right amount of distance luck?
- **Upgrade economy:** with costs 1 / 2 / 2 / 3 and a card shop, players upgrade more than once per hole. Is a maxed bag by hole 18 too fast for an 18-hole game?
- SAFE / RISKY putting averages about 1.7 putts per green for good bots. Once the putter reaches tier 4, RISKY is clearly best almost everywhere: is that the right reward for maxing the putter?
- Do players need a "punch out" shot from trees (short, straight)?
- Should wind exist (a die that shifts the aim line each hole)?
- How many holes make a good 60-minute session for 2 and for 4 players?