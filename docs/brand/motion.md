# xyz.log — mark motion spec

Exact specification of the brand-mark "writing" animation, so it can be
reproduced in any engine (CSS, SMIL, WAAPI, Lottie, a game loop, …).

Ready-to-use asset: [`docs/images/logo-animated.svg`](../images/logo-animated.svg)
(self-contained, CSS-driven, plays once and rests fully drawn).
Static end-state: [`docs/images/logo.svg`](../images/logo.svg).

---

## 1. Geometry

Coordinate space: SVG user units, viewBox `0 0 240 240`. The mark is clipped to
a squared tile `rect x=48 y=48 w=144 h=144 rx=1.5` (clip id `box`).

Five filled+stroked polygons (fill = stroke colour, `stroke-width 2.5`,
`stroke-linejoin/linecap round`). The whole stack is clipped to the silhouette
(`shape` = union of all five) so the drop shadows live only at the overlaps.

| # | role | colour | polygon points |
|---|------|--------|----------------|
| 0 | Z top plate    | `#6e76b9` | `77.73,65 162.27,65 205.73,47 34.27,47` |
| 1 | Z bottom plate | `#6e76b9` | `34.27,193 205.73,193 162.27,175 77.73,175` |
| 2 | Z "/" diagonal | `diag` gradient | `162.27,65 34.27,193 77.73,175 205.73,47` |
| 3 | "\" upper (Y)  | part of `bslash` | `34.27,47 113.64,126.36 126.36,113.64 77.73,65` |
| 4 | "\" lower (X)  | part of `bslash` | `113.64,126.36 162.27,175 205.73,193 126.36,113.64` |

The "\" is **rendered as one seamless hexagon** (polygons 3+4 merged, keeping the
two centre miter points on its edges) so there is no stroked seam across the
centre:

```
34.27,47 113.64,126.36 162.27,175 205.73,193 126.36,113.64 77.73,65
```

Paint order (bottom → top): **plates → "\" → "/"**. The "/" is painted last so
it hides the Y/X seam at the centre.

## 2. Colours & gradients

- `--x` indigo `#5e639e` · `--y` lavender `#a0a3d7` · `--z` periwinkle `#6e76b9`
- **`bslash`** (the "\", one smooth ramp, no hard break at centre) —
  `linearGradient` `userSpaceOnUse` x1 56 y1 56 → x2 184 y2 184:
  `0 → #a0a3d7`, `1 → #5e639e`.
- **`diag`** (the "/", distinct periwinkle so it reads *on top* of the "\") —
  `userSpaceOnUse` x1 184 y1 56 → x2 56 y2 184:
  `0 → #767ebf`, `0.5 → #6e76b9`, `1 → #626aae`.
- **`sheen`** (continuous light across all layers, TL highlight → BR shadow) —
  objectBoundingBox x1 0 y1 0 → x2 1 y2 1:
  `0 white@.42`, `0.38 white@.07`, `0.62 black@.06`, `1 black@.44`.
  Painted as a tile-sized `rect` per layer, each clipped to that layer's pieces.
- **Paper-cutout shadow** — `feDropShadow dx=0 dy=0 stdDeviation=1.8`,
  `flood #000 @0.33`, one per layer group. Symmetric (dx=dy=0) on purpose, so the
  two sides of the "/" crossing look identical — no "double divider line".
  (Mono variant: stdDeviation 0, opacity 0 — no shadow.)

## 3. The reveal

One straight white stroke "writes" each vector, flowing
**BR → C → TL → TR → BL → BR**. Each pen is a `path` with
`stroke-width 26`, `stroke #fff`, round caps/joins, confined by a clipPath to its
own bar, and lives inside a **per-layer reveal mask** — so a line only ever
uncovers its own piece (the "/" can never peek through the centre while the "\"
is still being drawn).

Reveal order (`pos`), the pen path, the bar it is clipped to, and which layer
mask it belongs to:

| pos | vector | pen path (`d`) | clip | layer mask |
|-----|--------|----------------|------|------------|
| 0 | X ("\" lower)  | `M199.56 199.56 L120 120`      | bar 4 | `mBack`  |
| 1 | Y ("\" upper)  | `M120 120 L40.44 40.44`        | bar 3 | `mBack`  |
| 2 | Z top plate    | `M34 56 L206 56`               | bar 0 | `mPlate` |
| 3 | Z "/"          | `M199.56 40.44 L40.44 199.56`  | bar 2 | `mSlash` |
| 4 | Z bottom plate | `M34 184 L206 184`             | bar 1 | `mPlate` |

Pen ends are extended ~22u past the outer nodes so the stroke fills the mitre
tips (still clipped per bar, so it never spills); the centre end (`120,120`) is a
plain butt so X and Y meet cleanly.

Masks (grouped by the layer they reveal):
- `mBack`  = pens 0 + 1  → the "\"
- `mPlate` = pens 2 + 4  → top + bottom plate
- `mSlash` = pen 3       → the "/"

## 4. Timing

Each pen animates `stroke-dashoffset` from full length → 0, **easing linear,
`fill: both`** (hidden before its delay, held drawn after).

| pos | delay (ms) | duration (ms) |
|-----|-----------|---------------|
| 0 (X)          | 0    | 175 |
| 1 (Y)          | 215  | 175 |
| 2 (top plate)  | 430  | 210 |
| 3 ("/")        | 680  | 290 |
| 4 (bottom)     | 1010 | 210 |

Last stroke ends at **1220 ms** (nominal `DRAW_MS` budget 1260 ms). Plays once;
rests on the full mark. Honour `prefers-reduced-motion: reduce` by showing the
final frame with no animation.

### Reference implementations

**CSS (as shipped in `logo-animated.svg`)** — normalise each pen with
`pathLength="1"`, `stroke-dasharray:1`, then:

```css
.pen0 { animation: draw 175ms linear    0ms both; }
.pen1 { animation: draw 175ms linear  215ms both; }
.pen2 { animation: draw 210ms linear  430ms both; }
.pen3 { animation: draw 290ms linear  680ms both; }
.pen4 { animation: draw 210ms linear 1010ms both; }
@keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
```

**WAAPI (original engine)** — per pen, with `L = pen.getTotalLength()`:

```js
pen.style.strokeDasharray  = L;
pen.style.strokeDashoffset = L;
pen.animate(
  [{ strokeDashoffset: L }, { strokeDashoffset: 0 }],
  { duration: dur, delay: delay, easing: 'linear', fill: 'both' }
);
```

**Loop variant** — give every pen the same total duration (e.g. 2800 ms) and bake
delay+dur into keyframe percentages (so they stay in sync across iterations):

```
pen0  0%→6.25%   | pen1  7.68%→13.93% | pen2 15.36%→22.86%
pen3 24.29%→34.64% | pen4 36.07%→43.57% | hold 0 until 100%
```

**Replay (play-once asset)** — re-run by reloading the SVG, or in a host page
re-trigger the CSS animations (toggle the class / `el.getAnimations().forEach(a=>{a.cancel();a.play()})`).
