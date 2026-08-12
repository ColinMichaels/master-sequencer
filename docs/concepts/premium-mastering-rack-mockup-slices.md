# Premium rack production asset map

The approved `premium-mastering-rack-realism-v2.png` concept is the visual source
for the premium equipment. The committed v2/v3 assets are deterministic crops
and composites rather than new interpretations of the accepted rack design.

## Control-free production plates — 2026-08-12

The v2 production plates preserve the accepted mockup's scales, legends,
logos, screws, rack ears, meters, texture, grime, and age while removing only
the photographed movable hardware. This prevents a code-native knob, switch,
or lamp from sitting over a second baked representation.

| Asset | Removed hardware | Interactive replacement |
| --- | --- | --- |
| `program-eq-faceplate-clean-v2.png` | Nine knob bodies, IN/BYPASS toggles and lamps | Semantic rotary controls and circuit switches |
| `bus-compressor-faceplate-blank-v2.png` | Six knob bodies, power lamp, IN/SC IN/BYPASS toggles and lamps | Semantic rotary controls, power control, option/circuit switches, live lamps |
| `bus-compressor-dual-vu-photoreal-v3.png` | User-supplied 1,946 × 808 dual-meter photograph has no static needles | Two live code-driven gain-reduction needles aligned to the photographed pivots and scale |
| `bus-compressor-faceplate-photoreal-v3.png` | The complete compressor background composites the supplied VU into the old meter rectangle | Single authoritative faceplate texture beneath transparent live-needle hit area |
| `precision-limiter-faceplate-clean-v2.png` | Four knob bodies, IN/BYPASS toggles, gain-reduction and oversampling lamps | Semantic rotary controls, circuit switches, live GR bank, selector lamps |

`scripts/prepare-premium-faceplates.mjs` records the generated edit sources,
deterministic crop rectangles, and final native dimensions used by the app. It
accepts the private generated-image directory at runtime so no machine-specific
path is stored in the repository:

```bash
node scripts/prepare-premium-faceplates.mjs /path/to/generated-image-sources
```

`bus-compressor-faceplate-blank-v2.png` and
`bus-compressor-dual-vu-photoreal-v3.png` remain as reproducible intermediates;
the app loads their single composite,
`bus-compressor-faceplate-photoreal-v3.png`. Superseded v1 control-bearing
slices are intentionally excluded to prevent the doubled-control regression.

Semantic sliders, buttons, selects, state, audio behavior, keyboard focus, and
expanded exact-value inputs remain code-native and sit over or beside the
control-free raster surfaces.

Every premium rotary exposes the same scaled value that reaches the saved audio
parameters through `aria-valuenow`, `aria-valuetext`, and its visual readout.
Logarithmic controls retain their analog-feeling travel, but never expose their
internal normalized slider position as the affected frequency or time value.
The visual readout grows from 16 px to 18 px while hovered, focused, or moved.
Each premium rotary also uses a faceplate-specific piecewise angle map tied to
the photographed printed detents. Neutral EQ gain points exactly to `0`, and
frequency, ratio, timing, ceiling, mix, and stereo-link pointers interpolate
between the actual neighboring legends instead of sharing a generic offset.
