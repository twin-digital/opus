# Room profile — "Choo choo choo" (league 1838733150), draft 2026-08-28

Scouting report from the 2024 and 2025 league drafts (both 10-team, 14-round snake; 140 picks
each). Tonight is 12 teams. Deviation is `overall pick − ESPN board rank` for the same season:
negative = took the player earlier than ESPN's list (reach), positive = let him fall (value).
Autopicks and K/DST are excluded from deviation stats; "early dev" restricts to board rank ≤ 100,
where deviation is behavioral rather than a mechanical artifact of drafting deep players.

## Reference-board validity

- **2025 kona** (`leaguedefaults/3`, `kona_player_info`): `ownership.averageDraftPosition` is a
  dead 170.0 sentinel for every player, but `draftRanksByRankType.STANDARD.rank` is genuine 2025
  preseason (Chase 1, Bijan 2, Gibbs 5, CMC 6, Nabers 8, Jayden Daniels 32). STANDARD == PPR
  for 2025. Used STANDARD rank.
- **2024 kona**: ADP and PPR ranks are in-season-contaminated (CMC adp 16.0, Kamara PPR rank 2
  — mid-season values, not preseason). STANDARD ranks are coherent preseason (CMC 1, Bijan 2,
  Saquon 10, Nabers 32, Daniels 117, Kamara 42). Used STANDARD rank.
- Coverage: 139/140 drafted players resolved in 2024, 140/140 in 2025. Verdict: **the boards are
  valid** for both seasons via STANDARD draft rank. Caveat: the league scores half-PPR, so the
  standard board slightly underprices pass-catchers; deviations are consistent within a season
  either way.

## League-wide read

The room drafts in ESPN's UI and it shows. Pooled over 223 human non-K/DST picks:

| Board rank | n   | mean dev | σ    |
| ---------- | --- | -------- | ---- |
| 1–30       | 55  | +1.0     | 4.5  |
| 31–60      | 50  | −1.2     | 10.8 |
| 61–100     | 59  | −8.0     | 14.0 |
| 101–200    | 56  | −34      | 25.6 |

- **Rounds 1–3 are ESPN's list almost verbatim** (mean dev +1, σ 4.5). Nobody gets cute early.
- Mid-draft noise grows roughly linearly with rank. A linear fit through the bins gives
  **σ ≈ 0.15·adp + 2.5** — the existing `sigmaForPick` fallback (`0.15·adp + 2`) is already
  right for this room; no retune needed. If a single flat σ is wanted for the first ~5 rounds,
  use **σ ≈ 8**.
- The steep negative mean past rank 100 is structural (a 140-pick draft takes deep players
  "early" by definition), not a room-wide reach habit.
- **K/DST norms**: kickers go R12–14 (one R10 outlier, James Johnson), defenses R11–14. Nobody
  burns a mid-round pick on either. QBs: most of the room waits to R4–6; two owners wait to R8–10.
- **Keepers**: zero in both seasons; draftSettings confirm no keepers for 2026.
- **Autopick encoding** (verified against the distribution): `autoDraftTypeId` 0 = live human
  pick; 2 = one-off autopick (timer/queue), appearing scattered singly (1 in 2024, 5 in 2025,
  mostly R13–14); 3 = team on full autodraft — all 14 of team 5's 2025 picks and nothing else.
  Autopicks carry no `memberId`; picks were attributed by seasonal `teamId` → owner.

## Owners, in 2026 draft order

Pick order by teamId: 8, 1, 9, 11, 7, 4, 10, 12, 3, 5, 13, 14. All returning owners kept their
2025 teamId. n = career picks here (28 = two full drafts).

### Slot 1 — Team 8, "Team Lettow" (G L) — n=28, auto 4%

Most ESPN-faithful drafter in the room (full-draft mean dev −3.5, σ 13.6; early dev −2.6).
Loyal: repeated Nico Collins, DK Metcalf, David Njoku, and Brock Purdy across both years; SF/HOU
lean. Takes RBs/WRs straight off the board, QB in R6–7, TE R7–8. One timer autopick (2025 R10).
Predict him with the plain ESPN list.

### Slot 2 — Team 1, "Purple Reign" (Chris Wollman) — n=28, auto 0%

On-board early (early dev −3.9, σ 7.1), chaotic late: deep-stash picks like 2025 Joe Mixon
(pick 73, board 192) and Isaac Guerendo (pick 133, board 351) make his full-draft σ the league's
largest (48.9). **Early TE both years** (Andrews R5, Kittle R4) and only 1–2 RBs through R6 —
WR/TE heavy. QB timing swung R6 → R10. Repeated DeVonta Smith.

### Slot 3 — Team 9, "No one healthy on BYE week" (jason walker) — n=14 (2025 only), auto 14%

One draft of history: disciplined (early dev −7, σ 11), **QB R4** (Lamar), rookie-RB friendly
(Jeanty R2, Skattebo). Biggest reach was Tony Pollard two rounds early. Let the clock run out on
his last two picks (R13 K, R14 DST autopicked).

### Slot 4 — Team 11, "Theo Von Retically" (James Johnson) — n=28, auto 7%

**TE early**: Kelce R4 in 2024, Bowers R2 in 2025. Owns the league's only early kicker (Fairbairn
R10 2024 — and drafted Fairbairn again in 2025). Repeats his guys (Brian Robinson Jr. both years,
the 2025 one at pick 119 vs board 265). HOU/WSH lean. Mid-draft RB reacher (Mixon 2024 −20);
full σ 33.6 is second-highest. His 2025 R3 (Jacobs) was a timer autopick.

### Slot 5 — Team 7, "King Kong" (kyle stefl) — n=28, auto 0%

Early rounds dead-on ESPN (early dev −1.1, σ 7.0). **QB waiter: R10 2024, R8 2025** — he will
not join a QB run. WR-heavy through R6 (2/3 and 2/4 RB/WR). 2025 rookie-RB reaches: Hampton R4,
Judkins at pick 86 vs board 191. TE timing swings (R4 LaPorta 2024, R10 2025).

### Slot 6 — Team 4, "Vinz Clortho: The Keymaster" (Dennis McGarrity) — n=28, auto 0%

Steady mid-reacher (early dev −4.2, σ 9.0). **QB R4–5 both years** (Richardson −18 in 2024,
Hurts 2025). 2025 rookie chaser: Travis Hunter, Tyler Warren, Colston Loveland. Repeated the
Bengals D/ST; CIN/IND lean. RB-leaning early (3/2 RB/WR through R6 in 2024).

### Slot 7 — Team 10, "La Porta Potty" (colin skow) — n=28, auto 0%

Tightest drafter in the room (early dev −1.3, **σ 5.1**) — near-pure ESPN early. **QB early and
getting earlier: R5 2024, R3 2025 (Josh Allen at pick 25)** — he starts the QB run. Drafted
Jahmyr Gibbs both years (R2 2024, R1 2025); DET lean; team name is a LaPorta pun and he took
LaPorta R6 2025. 2024 rookie chaser (Odunze, Caleb Williams pick 106 vs board 164, Corum).

### Slot 8 — Team 12, "Cache Money" (b kohl) — n=14 (2025 only), auto 0%

The only owner with a positive early dev (+1.8) — a value-waiter (Higgins +11, Adams +9,
Croskey-Merritt +35). RB-RB start (CMC, Taylor), **QB R9** (Herbert-class waiter), Kelce at
pick 67 vs board 97 his one big reach. One draft of history; treat as ESPN-plus-patience.

### Slot 9 — Team 3, "Scottie Pickens JR" (S s) — n=28, auto 0%

RB-leaning early (3/2 RB/WR through R6 both years), **QB R4–5 both years** (Mahomes, Burrow).
The league's biggest rookie chaser: 5 rookies in two drafts (Brooks, Coleman, Henderson, Golden,
Egbuka). Repeated Hockenson (as a 2024 deep stash at pick 103, board 172). TB/MIN lean.

### Slot 10 — Team 5, "Jefferson Airplane" (Jason Lehmer) — n=28, **auto 50%**

**Went full autodraft for the entire 2025 draft** (all 14 picks, `autoDraftTypeId` 3 — never
showed). His 2024 human draft was aggressive: Aaron Jones at pick 34 vs board 88, Jayden Daniels
at pick 54 vs board 117 (QB R6), plus Brock Bowers — likes his own guys when present. Repeated
Daniels (2025's was the autopick). Coin flip on which owner shows up; if absent, his picks are
ESPN's list verbatim.

### Slot 11 — Team 13, "Smite Club" (Sean Kleinjung — us)

2026 newcomer; no league history. Nothing for the room model to learn — that's what the draft
assistant is for.

### Slot 12 — Team 14, "The Dude Staleys" (Rob Petro)

2026 newcomer; no history. Default to the plain ESPN board with the league σ.

## So what for tonight

- **Model σ**: keep `sigmaForPick`'s `0.15·adp + 2` fallback — measured room noise is
  σ ≈ 0.15·rank + 2.5. Rounds 1–3 are near-deterministic ESPN order (σ 4.5).
- **Team 5 (slot 10) may be a robot again**: 2025 was 100% autodraft. If he's absent, his picks
  are exactly ESPN's live list — plan around it, and don't expect him to bite on non-ESPN values.
- **QB run starts at slot 7**: colin skow took Allen in R3 last year; McGarrity (slot 6) and
  S s (slot 9) follow by R4–5, and walker (slot 3) went R4. Four of nine returning owners take a
  QB by R5 — QBs leave earlier than a 12-team ESPN ADP baseline implies. stefl (slot 5) and
  kohl (slot 8) won't participate (R8–10).
- **TE goes early twice**: Johnson (slot 4) took Bowers R2/Kelce R4; Wollman (slot 2) takes a TE
  R4–5 every year. Elite TEs price a round ahead of board.
- **No K/DST before R10** — ever, except Johnson's R10 Fairbairn habit (both years). Ignore
  K/DST until R12+.
- **Loyalty picks to snipe or fade**: skow → Gibbs (twice) and LaPorta; Lettow → Nico Collins /
  Metcalf / Njoku / Purdy; Johnson → B-Rob and Fairbairn; Lehmer → Jayden Daniels; Wollman →
  DeVonta Smith.
- **Rookie chasers**: S s (slot 9) and McGarrity (slot 6) reach for rookies; stefl reached hard
  for rookie RBs in 2025. Expect rookies to go ahead of ESPN board in the middle rounds.
- **History is 10-team; tonight is 12.** Round-based habits ("QB in R4") likely track rounds,
  not overall pick number — positional runs land ~1 round deeper in overall-pick terms.
