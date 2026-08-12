# Mastering Plug-in Analog Visual Design Notes

Status: planned visual refinement; DSP, persistence, and rack behavior are already implemented

## Goal

Bring the seven new built-in plug-ins up to the same convincing studio-hardware
standard as Program Equalizer, Bus Compressor, Master Output, and Precision
Limiter. Each processor should read as a distinct piece of mastering equipment
while remaining part of one coherent Project Sequencer rack.

The designs must be original. They may use familiar professional-audio visual
language—engraved legends, stepped switches, illuminated meters, rack ears,
painted steel, brushed aluminum, Bakelite-style knobs, and restrained wear—but
must not reproduce another manufacturer's faceplate, trademark, logo, or exact
control layout.

## Shared hardware language

- Keep the existing fictional equipment families: Harbor Signal, Northline
  Audio, Resolute Works, and Ironvale Labs. Their materials, typography, knob
  caps, lamps, and fasteners should be internally consistent across models.
- Create control-free faceplate artwork. Interactive knobs, switches, values,
  focus rings, lamps, and meter needles remain semantic HTML/CSS layers so they
  stay accurate, accessible, and responsive.
- Use the full-width faceplate on desktop. At narrow widths, show a compact
  hardware summary plus the most important controls and let the exact-value
  inspector reflow vertically; do not shrink labels or touch targets into an
  unreadable miniature rack.
- Keep bypass unmistakable: the power or circuit lamp extinguishes, the unit
  dims, and the signal-path label says `Bypassed`. The unit must not disappear.
- Meter animation must come from the live audio graph. Decorative displays may
  establish character, but they must never imply signal activity when playback
  is stopped or the plug-in is bypassed.
- Preserve visible numeric values, keyboard adjustment, focus indication,
  screen-reader labels, and reduced-motion behavior regardless of the artwork.
- Use restrained texture and depth. The target is maintained mastering-room
  equipment, not distressed stage gear or a novelty skeuomorphic skin.

## Processor directions

### 1. Stereo Field Matrix — Harbor Signal S-4 FIELD

- Wide cyan-black 2U matrix panel with one large `WIDTH` control and a slightly
  smaller `DEPTH` control as the primary hierarchy.
- A central stereo field display should combine a slow vectorscope trace with a
  correlation bar. It is monitoring only and must not alter the print.
- Give `MONO BELOW` a guarded stepped-frequency switch and group `SPACE` plus
  `SPACE FREQ` as a secondary high-frequency width circuit.
- Represent balance with a center-detented horizontal trim or dual-arrow scale.

### 2. Harmonic Color — Northline Audio H-3 COLOR

- Warm amber, brown, and dark-brass 2U panel suggesting a discrete line stage.
- Make `DRIVE` and `MIX` the dominant controls. Use smaller concentric or paired
  controls for even/odd harmonic balance and color focus.
- Add a softly illuminated harmonic-content display or paired even/odd lamps;
  it should respond to actual drive and mix values, not random animation.
- Present oversampling as a positive-locking rotary switch and keep output trim
  visually separated as the final stage.

### 3. Phase Alignment — Resolute Works P-1 ALIGN

- Precision violet-gray 1U service-instrument panel rather than a creative
  modulation effect.
- Use a vernier-style sample-delay control, a prominent protected polarity
  switch, and a phase-rotation dial with a clear zero position.
- Include a compact phase/correlation compass that shows the selected Left,
  Right, Mid, or Side target.
- Visually distinguish this repair unit from Creative Phaser so their purposes
  cannot be confused at a glance.

### 4. HF Smoother — Ironvale Labs HF-2 SMOOTH

- Cool silver-blue 1U panel with a frequency crossover dial and a narrow amber
  gain-reduction meter focused on the high band.
- Make threshold and amount immediately readable; place attack/release and
  output trim in a secondary row.
- Use a subtle high-frequency silk-screen curve to explain the affected region
  without turning the panel into a generic chart dashboard.

### 5. Mastering Ambience — Harbor Signal A-7 SPACE

- Deep teal 2U panel inspired by a compact echo chamber controller.
- Use illuminated `ROOM`, `CHAMBER`, and `PLATE` selector windows with large
  decay and wet controls. Wet retains its deliberately restricted 0–5% range.
- Group pre-delay, damping, low cut, and width around a restrained decay-tail
  display driven by the selected deterministic impulse model.
- Include a visible reminder that this is mastering ambience and that the final
  limiter normally follows it.

### 6. Transient Sculptor — Resolute Works T-5 IMPACT

- Graphite-lime 1U dynamics panel with opposing `ATTACK` and `SUSTAIN` controls.
- Show a center-zero impact meter so positive and negative shaping read
  immediately. Its motion should derive from the live detector when available.
- Make Full Range versus Focused operation a mechanical two-position selector;
  reveal the focus-frequency control only when it has signal duty.
- Use a linked-chain lamp for stereo-linked detection.

### 7. Creative Phaser — Northline Audio P-6 MOTION

- Dark magenta/black 1U panel with an unmistakable creative-effects identity.
- Give rate and depth the primary controls, with feedback, center frequency,
  mix, and stereo offset grouped around a slow phase-wheel or Lissajous display.
- Retain the existing mono-compatibility warning as a permanent visual stripe
  or lamp rather than hiding it in help text.
- Meter motion must follow the actual LFO and playback state. Stopped playback
  should leave a clear static reference, not simulated movement.

## External plug-in representation

Until the signed native host resolves an owned VST3 or Audio Unit, show a
generic blank rack plate stamped with vendor, plug-in name, format, ownership,
and `Unavailable — native host required`. Preserve remove, reorder, duplicate,
and state actions, but do not invent controls or a fake manufacturer UI.

After resolution, prefer the plug-in's native editor when safely available and
provide a Project Sequencer generic parameter panel as the accessible fallback.
The rack header and bypass/availability treatment should remain consistent with
the built-ins.

## Production sequence

1. Stereo Field Matrix and Phase Alignment, because their visual monitoring
   directly explains spatial and phase decisions.
2. Harmonic Color and HF Smoother, because their analog character and reduction
   feedback are currently underrepresented.
3. Mastering Ambience and Transient Sculptor, including truthful live displays.
4. Creative Phaser, after the shared motion and reduced-motion rules are proven.
5. Generic unavailable-external plate and native-editor/fallback framing.

For each unit, create a desktop concept, a control-free production asset, a
semantic control map, and a 390 px compact layout. Verify normal, hover, focus,
active, bypassed, unavailable, stopped, and playing states in both light and
dark appearance modes before marking the visual pass complete.
