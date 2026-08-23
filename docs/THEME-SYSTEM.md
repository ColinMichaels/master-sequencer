# Theme System

Project Sequencer treats appearance as portable project preference data, not as
a separate application layout. Every theme keeps the same workspace hierarchy,
controls, keyboard behavior, and source-audio boundaries.

## Included themes

- **Signal** is the original production-board palette.
- **Analog Studio** keeps the warmer walnut, brass, and amber treatment.
- **Dusty Studio** uses the same studio controls with a darker, faded room and
  more restrained signal light.
- **Grunge** uses blackened concrete, chalk dust, worn edges, and a bundled
  seamless texture.
- **Ocean**, **Ember**, and **Violet** remain the existing alternate palettes.

Light, Dark, and System mode; font pairing; and text scale remain independent
of the selected color theme. Analog Studio and Dusty Studio additionally expose
three saved character controls:

| Setting | Values | Purpose |
| --- | --- | --- |
| Console material | Walnut, Mahogany, Black Oak | Changes the wood/rack surface family |
| Signal light | Amber, Valve, VU Green | Changes accents, focus, and meter glow |
| Room atmosphere | Clear, Balanced, Smoky | Changes decorative light and haze intensity |

## Implementation contract

`src/lib/appearance.js` is the registry and normalization authority. New values
must also be accepted by `server/state-schema.mjs` so imported and saved project
documents fail closed on unknown appearance data.

`src/hooks/useAppearance.js` applies normalized values to the root element:

```text
data-mode
data-theme
data-font
data-studio-material
data-studio-light
data-studio-atmosphere
--text-scale
```

Theme styles consume those attributes and the shared tokens. They must not copy
workspace components or replace the shared layout. The studio treatment lives
in `src/styles/analog-studio.css`; Grunge lives in
`src/styles/grunge.css` and uses the bundled
`src/assets/grunge-texture.jpg` only as a decorative surface.

Atmospheric overlays must stay behind interactive content, ignore pointer
events, scale down on narrow screens, and disappear when the operating system
requests reduced transparency. Text and control contrast remains authoritative;
texture can never be the only way a state is communicated.

## Adding a theme

1. Register its stable identifier, label, and description in
   `src/lib/appearance.js`.
2. Add the identifier to the server appearance allowlist.
3. Create theme rules from shared design tokens under `src/styles/` and import
   the file from `src/styles.css`.
4. Add a preview swatch using the same stable identifier.
5. Test normalization, save/reload behavior, Light and Dark mode, 390-pixel
   layout, 120% text, contrast, and reduced-transparency behavior.

Useful checks from the repository root:

```bash
npm run check
npm run test:accessibility
npm run test:browser -- --grep "Analog Studio|Grunge"
```

Appearance data may be synchronized with a future account project document.
The theme texture is an application asset; no source audio, media path, file
handle, or machine credential enters appearance state.
