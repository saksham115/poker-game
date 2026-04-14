# Bot Design Notes

Notes on the `BotPlayer` in `backend/app/players.py` — what it does today, the
tradeoffs baked into the current implementation, and the roadmap to make the
bots play closer to a strong human regular.

The target is a chess.com-style product where the *default* opponent should
feel competent, not random. The bot is currently at "Regular tier" in the
roadmap below.

## Current implementation (Regular tier)

Every decision is built from four inputs:

1. **Hand category** — five tiers derived from hole cards:
   `premium / strong / playable / speculative / trash`.
2. **Position bucket** — `EARLY / LATE / SB / BB`, computed from seat
   distance to the dealer button at the number of seats at the table.
3. **Street state** — number of raises this street, active opponents,
   pot, pot odds, whether the bot was the preflop aggressor, and whether
   the bot is the last to act on the current street (in position).
4. **Style modifier** — `tight / balanced / aggressive / maniac`. Tunes
   open range width, c-bet frequency, bluff frequency, and value bet
   sizing on top of solid play. It never injects random bad decisions.

### Preflop decision table

| Position | Opens (0 raises) | Vs. single raise | Vs. 3-bet or more |
|---|---|---|---|
| EARLY (UTG/MP) | premium + strong | premium → 3-bet, else fold | premium only |
| LATE (CO/BTN) | premium + strong + playable | premium → 3-bet, strong → call, else fold | premium only |
| SB | premium + strong | premium → 3-bet, strong → call, else fold | premium only |
| BB | (checks — no open) | premium → 3-bet, strong/playable → call, else fold | premium only |

Style `open_shift` widens or tightens the open range by one tier in either
direction.

Sizing:
- **Open raise**: 3 × big blind
- **3-bet**: 3 × call amount
- **4-bet+**: 2.5 × call amount, only when holding premium

### Postflop decision flow

```
equity = estimate_hole_card_win_rate(
    nb_simulation = 1000,
    nb_player     = active_opponents + 1,
    hole_card     = gen_cards(hole),
    community_card = gen_cards(board),
)

to_call  = call_amount - my_current_bet_on_street
pot_odds = to_call / (pot + to_call)
```

Then:

| Condition | Action |
|---|---|
| `equity ≥ 0.78` and can raise | value bet at `pot × style.value_factor` |
| `equity ≥ 0.62` and can raise and (is_aggressor or in_position) | value bet at `pot × 0.66` |
| `equity ≥ pot_odds + 0.03` | call (occasionally c-bet if aggressor on flop) |
| `to_call == 0` | check |
| Aggressor, in position, flop, style bluff roll succeeds | bluff c-bet at `pot × 0.5` |
| Otherwise | fold |

### What this gets right

- **Folds trash out of position, opens premium/strong UTG, widens on BTN.**
  Matches a solid TAG reg's preflop shape.
- **Pot odds are computed from the bot's actual chips-to-call**, not the
  engine's "bet level" number. A previous naive implementation would have
  double-counted money already in the pot.
- **Equity is real Monte Carlo** via PyPokerEngine's
  `estimate_hole_card_win_rate`, not a made-up hand score. Straights,
  full houses, and backdoor draws are evaluated correctly because the
  sampler uses the real `HandEvaluator`.
- **Value bets scale with equity and style**, not with RNG.
- **Style is a personality layer** over solid play. A maniac still folds
  72o from UTG and still value-bets sets — it just opens wider and fires
  more c-bets.

## Known limitations

### 1. Equity is calculated against *random* hands, not ranges

This is the single biggest gap. When the bot computes equity, it assumes each
opponent holds a uniformly random two-card hand. Real opponents who reach
the flop have a *narrowed* range based on their position and preflop
action (an UTG open is a tight range, a BB call is a very wide range).

**Impact**: the bot plays slightly too loose vs. tight opens (overestimates
its equity against their range) and slightly too tight vs. wide opens.
Against a human who plays a tight range, the bot will call down too often
with marginal hands.

### 2. C-bet logic only fires on the flop

The bot never double- or triple-barrels. Real regs barrel turn when they
pick up equity (turn gives them a draw) or when the turn card is scary for
the caller's range (a face card after a low flop). The bot currently gives
up on the turn with anything that isn't already a made hand.

### 3. No check-raise or float lines

The bot never check-raises and never calls flop with the plan to bluff
turn. Both are standard tools in a strong reg's kit.

### 4. No MDF / bluff-catcher logic

Facing a river bet with a marginal hand, the bot decides purely from raw
pot odds. It doesn't consider minimum defense frequency, blocker effects,
or the polarized vs. linear nature of villain's river bet sizing.

### 5. No SPR or stack awareness

Stack-to-pot ratio shapes commitment decisions in real poker. A set on a
wet board with 1 SPR gets the money in; the same set on the same board
with 15 SPR has to play it more carefully. The bot doesn't see SPR at all.

### 6. Action histories aren't read past "was I the preflop raiser"

The bot doesn't care whether the flop went check-check before it's asked
to act on the turn. It doesn't track opponent aggression frequency,
position, stack depth, or showdown history. Every hand is a fresh
decision context.

### 7. Bluff frequency is a flat constant per style

A Pro-tier bot should bluff more on boards that connect with the range it
is representing (ace-high flop when it was the preflop raiser) and less on
boards that don't (middling disconnected flop). The current implementation
bluffs the same percentage regardless of board texture.

## Roadmap

Tiered by effort and expected "elo" improvement.

### Pro tier (the next realistic pass)

Each item is independently useful; they can ship in separate commits.

- [ ] **Opponent range modeling**. Define a preflop open range for each
  position (e.g. UTG = top 12% of hands, BTN = top 45%). When computing
  equity, sample opponent hole cards from that range instead of uniformly
  from the deck. Narrow the range further based on their action (a 3-bet
  from EARLY = top 4%, a call from BB = defended range).
- [ ] **Turn barrelling**. Fire a second barrel when: was the flop
  aggressor, equity ≥ 45% vs. villain's narrowed range, and the turn card
  doesn't obviously hit villain's calling range.
- [ ] **Board-texture-aware c-bet**. Replace the flat `cbet_freq` style
  modifier with a function of the flop: high c-bet on dry ace-high,
  low c-bet on wet middling boards.
- [ ] **Hand history memory**. Track each opponent's VPIP (voluntarily put
  in pot) and PFR (preflop raise) over the session. Adjust their range
  width at decision time: a player who's been folding 90% preflop has a
  much tighter range than the baseline chart.
- [ ] **MDF bluff-catching**. On river decisions with marginal hands,
  compare call frequency to minimum defense frequency against villain's
  bet size, not just pot odds.

### Solver tier (large effort, only worth it for top bots)

- [ ] **Preflop solver charts**. Replace the 5-tier hand categorization
  with actual GTO preflop ranges (from a solver like PioSolver or GTO+)
  for each position at each stack depth. This is a compile-time data
  dump, not a runtime solve.
- [ ] **Key-spot postflop solutions**. Precompute solver outputs for
  common postflop decision points (single raised pot, 3-bet pot, IP/OOP
  × SPR bucket) and look up the mixed-strategy frequency at decision
  time. Still not a live solve — just a big lookup table.
- [ ] **Elo-calibrated bot roster**. Build a ladder of bots by turning
  features on/off and tuning noise. Chess.com exposes bots from ~800
  to ~2800 elo; poker can do the same by gating range modeling, bluff
  frequency, and solver lookup on bot level.

### Not worth building here

- Reinforcement-learning agents (PokerZero-style). Huge effort, not
  differentiated for a casual product, and hard to tune for specific
  difficulty tiers.
- Live GTO solving during a hand. Takes seconds per decision on
  commodity hardware — too slow for a real-time UI.

## Performance

- **1000 Monte Carlo simulations per equity call** ≈ 5–20 ms per bot
  decision. Cheap compared to the 1.8 s artificial `think_delay`.
- **5 bots × ~3 decisions per hand** = ~15 equity calls per hand, so
  ~75–300 ms per hand on equity. Fine.
- **Cache opportunity**: equity for the same `(hole, board, n_opponents)`
  is stable in expectation. If latency ever matters, `functools.lru_cache`
  with card-string keys across a single hand is trivial to add.

## Testing

No backend tests yet. A useful starter suite:

- **Unit**: `_hand_category` for every 2-card combo (1326 hands), snapshot
  the distribution across tiers.
- **Unit**: `_position_bucket` and `_in_position_postflop` across
  2–6 player tables with every button position.
- **Integration**: run N hands of bot-vs-bot with fixed seeds and assert
  that tighter styles finish with smaller variance and that aggressive
  bots win more pots vs. tight bots heads-up over the long run.
- **Regression**: pin specific `(hole, board, history)` spots and assert
  the bot returns the expected action class (fold / call / value raise /
  bluff). Protects against silent behavior drift when tuning.
