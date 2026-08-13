# Game design — JONAS BIRTHDAY BASH

> Vier Level. Ein Endgegner.

## 1. Premise

Jonas turns 34. The game is a birthday bash built from four trials pulled from
things he actually likes. He passes all four, the game congratulates him — and
then tells him the real present is not on Berlin's streets but in a warehouse
in Berlin with a headset on his face: **Sandbox VR**.

Every level is drawn from something he actually likes, so the game reads as "we
know you" rather than "we made a game". That is the entire emotional payload;
mechanics serve it.

## 2. Constraints that drive everything

| Constraint | Consequence |
|---|---|
| Played on **his** phone, portrait, one-handed | Logical portrait canvas; all interaction in the lower 2/3; no two-finger gestures; no landscape |
| Played at a party, possibly tipsy, possibly loud | No timing window under 200 ms; no reading required mid-level; game must be fun **muted** |
| It's a gift, not a challenge | He must finish. Mercy rules are load-bearing, not a fallback |
| Might be played in a basement / on Sisyphos' dancefloor with no reception | Offline-capable (service worker precache), no network calls after first load |
| One shot at the surprise | The reveal must be unmissable and un-skippable-by-accident |

**Target session length: 5–7 minutes**, first tap to reveal.

## 3. Dramaturgy — why this level order

The order is a DJ set, not a difficulty curve:

```
L1 Pfand      warm-up      kick comes in           moderate
L2 Sisyphos   tension      offbeat bass, darker    highest
L3 Katjes     mania        arp on top, brightest   frantic
L4 Kayak      breakdown    KICK DROPS OUT, pads    calm, near-zero
   REVEAL     the drop     everything at once      —
```

L4 is deliberately the *calmest* level and sits immediately before the reveal.
He goes quiet, the music strips down to pads, he floats — and then the gift
lands on the drop. Putting the hardest level last would end the game on
frustration; this ends it on a lift. **The music and the level order are one
design decision, not two** (see §6).

## 4. Levels

Tuning constants are given so implementation is unambiguous. They are starting
values, to be corrected by the balance report (see TESTING.md §5), not guesses
to defend.

Shared: logical canvas **390 × H**, where `H = clamp(round(390 * vh / vw), 620, 900)`.
Fixed timestep 1/60 s. Lives are **per level** and reset on retry.

---

### L1 — PFANDPIRAT NEUKÖLLN

*Sonnenallee, morgens um sieben. Das Pfand gehört dir.*

| | |
|---|---|
| **Verb** | Run (auto) + tap to jump |
| **Input** | Tap anywhere = jump. Nothing else. |
| **Goal** | Collect **38 Flaschen = 9,50 €** |
| **Fail** | 2 hits |
| **Length** | ~45–70 s |

- Player runs in place at `x = 92`; world scrolls left. Ground at `y = H − 130`.
  Hitbox 34 × 46.
- Gravity `2400 px/s²`, jump impulse `−760 px/s`. **Coyote time 100 ms, jump
  buffer 120 ms** — non-negotiable, this is what makes it feel fair on a
  touchscreen with input latency.
- Scroll speed `v = 265 + min(330, 6.0·t)` px/s — the back half of the run is
  where this level is decided.
- Spawn gap `rand(195, 305) · (v / 265)` px, so the ramp doesn't secretly also
  compress spacing.
- Entity mix: 52 % Pfand cluster (1–3 bottles, on the ground or on a jump arc),
  48 % obstacle — E-Roller (40 × 30, ground), Hundehaufen (24 × 16, ground),
  Baustellenzaun (30 × 54, must jump).
- A hit costs a life and grants **1.2 s invulnerability**, but **never costs
  collected bottles**. Losing progress feels punitive; losing a life reads as a
  scratch.
- HUD: a Pfandbon-style receipt strip — `€ 3,25 / 6,50` in tabular numerals.

**Juice:** bottles clink and arc into the HUD counter; the E-Roller topples with
a ding; at 6,50 € a Pfandautomat spits out the Bon.

---

### L2 — SISYPHOS, 6 UHR FRÜH

*Der Türsteher schaut dich an. Sei einfach schon drin.*

| | |
|---|---|
| **Verb** | Steer left/right, advance automatically |
| **Input** | Drag thumb horizontally |
| **Goal** | Reach the gate — 4300 px of queue |
| **Fail** | 3 rejections |
| **Length** | ~25–40 s |

- Top-down. Player at `y = H − 170`, `x` lerps toward the pointer at `12/s`,
  hitbox `r = 16`. World scrolls down at `132 px/s`.
- Türsteher in rows every 220 world-px, 1–2 per row (56 % are two), moving
  horizontally at `78–138 px/s` and bouncing off the edges. Hitbox `r = 22`.
  The upper speed is a fairness limit, not taste: above ~140 px/s a two-bouncer
  row can close its own gap before it reaches you, and the fuzz test in
  TESTING.md §4 finds it.
- Contact = "Heute nicht." → lose a life, pushed **back 330 px**, 1.2 s
  invulnerability. Being pushed back rather than reset is what keeps three
  rejections from meaning "start over".
- Pickup 🕶️ **Sonnenbrille** roughly every 850 px: 3.5 s of being ignored by
  bouncers. Thematically: *du siehst aus, als gehörst du dazu*.
- Backdrop: the yard — fairy lights, trees, silhouettes, the chimney. Fairy
  lights pulse on the beat (they're the only on-beat visual in the game, which
  is what makes it read as "the music is coming from inside").
- Win: gate opens, hand-stamp animation thumps down. **Stempel drauf.**

---

### L3 — SALZIGE HERINGE

*Es regnet Katjes. Das Gemüse ist eine Falle.*

| | |
|---|---|
| **Verb** | Catch |
| **Input** | Drag thumb horizontally |
| **Goal** | 36 Heringe |
| **Fail** | 3 vegetables caught |
| **Length** | ~25–40 s |

- Player (an open Tüte) at `y = H − 120`, width 56, lerps to pointer at `16/s`.
- Spawn interval `0.50 s → 0.26 s` over 32 s; fall speed `255 → 430 px/s`.
- Mix: 60 % Hering (+1), 32 % Gemüse (−1 life), 8 % Lakritz-Bonus (+3).
- Vegetables are visually **loud and unmistakable** (broccoli, carrot, aubergine
  — round, green/orange, tumbling) versus the flat black-and-white herring. At
  340 px/s on a small screen, silhouette contrast is the only thing that makes
  this readable; colour alone is not enough in a dark room.
- A vegetable that reaches the ground uncaught bounces once and leaves. Only
  *catching* one hurts, so the correct play is legible: move to the fish, not
  away from the vegetables.

---

### L4 — KAYAK VR: MIRAGE

*Bleib ruhig. Lass dich treiben.*

The joke level, and the best one: it punishes trying hard. Also a direct nod to
the kayak simulator he'll actually be near.

| | |
|---|---|
| **Verb** | Do almost nothing, gracefully |
| **Input** | Drag — but gently |
| **Goal** | 6400 px downriver (~55 s) |
| **Fail** | **Ruhe** hits 0 |
| **Length** | ~40–55 s |

- River channel centre: `cx(y) = W/2 + 72·sin(y·0.0042) + 34·sin(y·0.0113 + 1.7)`.
  Channel half-width `80 px`, narrowing to `55 px` over the level — the narrowing
  is what makes L4 hard; the rock field is deliberately kept thin.
- Kayak at `y = H − 190`; `x` follows the pointer at a deliberately sluggish
  lerp of `6/s`. The sluggishness *is* the mechanic — it makes over-correcting
  the natural mistake.
- **Ruhe meter**, 0–100, starts at 100:
  - `panic = max(0, |vx| − 52)` → `Ruhe −= panic · 0.05 · dt`
  - outside the channel → `Ruhe −= 8 · dt`
  - inside the channel **and** `|vx| < 30` → `Ruhe += 5 · dt` (cap 100)
- Downstream speed `130 px/s` inside the channel, `78 px/s` outside. Drifting
  wrong is *slow*, not fatal — the meter punishes flailing, not error.
- Rocks roughly every 460 px, placed near a channel edge, `r = 28`. Contact:
  `Ruhe −20` + screen shake (suppressed under `prefers-reduced-motion`).
- Fail copy: **„Zu hektisch. Atme."** — retry is instant, no card to dismiss.
- Win: the music has been stripping away the whole level; at 100 % a **whale
  breaches** across the full width, and the screen goes white.

---

## 5. Reveal

Straight out of the whale's splash, without a menu in between:

1. White flash → the frame becomes the **inside of a VR headset** (two soft
   lens vignettes, a faint screen-door texture).
2. Type-on, one line at a time, over a 4-bar build:
   *„VIER LEVEL GESCHAFFT."* → *„EIN ENDGEGNER FEHLT."* → *„ER STEHT NICHT AUF DER STRASSE."*
3. **The drop.** Full track, confetti, and the card:

   > **SANDBOX VR**
   > BERLIN
   > *Du. Wir. Headsets. Bald.*

4. A second, quieter card with the practical details, pulled from
   `src/config/gift.ts` — date, time, meeting point, who's coming. **All gift
   text lives in that one file** so it can be corrected an hour before the party
   without touching game code or re-running the test suite's expectations.
5. Below it: **„NOCHMAL SPIELEN"**, and a level-select so he can show someone
   the kayak bit.

The reveal state is written to `localStorage` and is **never gated again** — once
seen, a "→ zum Geschenk" button sits on the title screen forever. Nobody should
have to re-earn a present.

## 6. Audio

House, because that is his music. Fully synthesised with WebAudio — no audio
files, so the whole game stays a few hundred KB and works offline.

- **126 BPM, A minor**, one continuous track across the entire game. Levels add
  and remove *layers*; the track never restarts. Transitions land on the next
  bar boundary, so moving between levels feels mixed, not cut.

| Layer | Title | L1 | L2 | L3 | L4 | Reveal |
|---|---|---|---|---|---|---|
| Hats (offbeat 8ths) | ● | ● | ● | ● | ○ | ● |
| Kick (four-on-the-floor) | ○ | ● | ● | ● | **○** | ● |
| Clap (2 & 4) | ○ | ● | ● | ● | ○ | ● |
| Offbeat bass | ○ | ○ | ● | ● | ○ | ● |
| Pluck arp | ○ | ○ | ○ | ● | ○ | ● |
| Pads | ○ | ○ | ○ | ○ | ● | ● |
| Chord stabs | ○ | ○ | ○ | ○ | ○ | ● |

- In L4 the low-pass filter opens as `Ruhe` rises — calm literally sounds
  brighter. It's the only place a meter drives the mix.
- **The game must be fully playable and readable muted.** Assume the first play
  is silent, and that a "🔊 Ton an?" prompt on the title screen is the only
  chance to fix that.
- iOS requires a user gesture before audio: the title screen's start button is
  that gesture, and audio resume failures are silent and non-blocking.

## 7. Art direction

**Berlin club flyer, not arcade.** The visual reference is a Sisyphos/Berghain
flyer: plain heavy grotesque, uppercase, wide letter-spacing, hairline rules,
enormous margins, one hot accent on near-black. This is a deliberate rejection
of the neon-arcade look the subject would normally attract — the flyer language
is what he actually recognises from the door of the club.

**Palette** — committed single theme (it's a screen in a dark room, not a
document; no light mode):

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#07060F` | Ground. Blue-biased near-black, not pure black |
| `--panel` | `#12102A` | Cards, HUD strips |
| `--pink` | `#FF2D6F` | Primary accent — flyer pink. L2, reveal |
| `--amber` | `#FFB300` | L1 Pfand, money, the Bon |
| `--teal` | `#23D3C4` | L4 water, Ruhe meter |
| `--haze` | `#B9B4D6` | Body text. Lavender-biased grey, never neutral |
| `--chalk` | `#F3F0FF` | Headings, HUD numerals |

Boldness is spent on the accent and on type scale; everything else stays quiet.

**Type** — system grotesque stack (`ui-sans-serif, system-ui, "Helvetica Neue",
Arial`), because a flyer's plainness is the point and a webfont is dead weight
on a phone. Display: uppercase, weight 800, `letter-spacing: 0.14em`. Numerals:
`ui-monospace` with `tabular-nums`, so the score doesn't jitter.

**Sprites** — props are drawn from an **emoji atlas pre-rendered into an
offscreen canvas at boot** (one draw per glyph, then blitted). Zero asset
pipeline, which is the right trade at this deadline.

> **Known risk:** emoji render differently across iOS/Android and a few glyphs
> are ambiguous at 28 px. Mitigation: keep the set small, check it on a real
> Android and a real iPhone at M2, and hand-draw the 3–4 glyphs that read badly.
> Characters (player, Türsteher, whale) are hand-drawn vector shapes from the
> start — those must not vary by platform. Tracked as R2 in PLAN.md.

## 8. Difficulty and mercy

He must reach the reveal. Non-negotiable, encoded as rules:

1. **Fail twice on a level → a „Überspringen" button appears** on the fail card,
   alongside retry. Never offered before the second fail (it would read as the
   game not believing in him).
2. **Fail four times → the level auto-eases**: −35 % obstacle density, −18 %
   speed, +2 lives. Silently. No "easy mode" label. This is where the promise
   lives: the raw levels are allowed to be genuinely hard *because* the ease is
   strong, and TESTING.md §3 gates the eased level, not the raw one.
3. Level progress is persisted, so a phone call or a dead battery costs at most
   the current level.
4. No global lives, no game over, no score minimum. The only terminal state is
   the reveal.
5. `?skip=1` jumps straight to the reveal — the manual override if something is
   broken at the party. Documented in DEPLOY.md, and the reason the reveal is
   reachable even if every level is.

## 9. Copy

German, du-form, dry, Berlin-blunt. Never quirky-cute, never exclamation marks
in threes. Sample voice:

- Title: **JONAS BIRTHDAY BASH** / *34 Jahre alt* / „Vier Level. Ein Endgegner."
- L2 fail: „Heute nicht."
- L3 fail: „Du hast Gemüse gegessen. In Neukölln."
- L4 fail: „Zu hektisch. Atme."
- Skip button: „Überspringen (wir verraten's keinem)"
