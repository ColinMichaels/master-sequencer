export const e2eProjectState = {
  schemaVersion: 2,
  activeAlbumId: "fixture-album",
  settings: {
    revealPrivateFilenames: false,
    appearance: { mode: "dark", colorTheme: "signal", fontTheme: "condensed", textScale: 1 },
  },
  albums: [{
    id: "fixture-album",
    artist: "Fixture Artist",
    title: "Fixture Album",
    era: "current",
    status: "working",
    orderApproved: false,
    baselineTrackOrder: ["alpha", "protected"],
    visualAssets: [],
    tracks: [
      {
        id: "alpha",
        title: "Alpha Tone",
        decisionStatus: "undecided",
        masterCandidateId: "",
        auditionCandidateId: "alpha-a",
        notes: "",
        visualAssets: [],
        candidates: [
          { id: "alpha-a", label: "Primary Mix", sourceRef: { rootId: "test-root", relativePath: "Alpha Tone.wav" }, flags: [], notes: "" },
          { id: "alpha-b", label: "Alternate Mix", sourceRef: { rootId: "test-root", relativePath: "Alternate Mix.mp3" }, flags: [], notes: "" },
        ],
      },
      {
        id: "protected",
        title: "[SIGNAL SOURCE WITHHELD]",
        privacy: "protected",
        decisionStatus: "undecided",
        masterCandidateId: "",
        auditionCandidateId: "private-a",
        notes: "Protected fixture",
        visualAssets: [],
        candidates: [
          { id: "private-a", label: "Private candidate A", sourceRef: { privateSourceId: "fixture-private-a" }, flags: ["Protected"], notes: "" },
        ],
      },
    ],
  }],
}; 
