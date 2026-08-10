import React, { useEffect, useState } from "react";

export function ProjectIdentityForm({ artistName, onSubmit, setup = false }) {
  const [draft, setDraft] = useState(artistName || "");
  const normalizedArtist = draft.trim();
  const unchanged = normalizedArtist === artistName;

  useEffect(() => {
    setDraft(artistName || "");
  }, [artistName]);

  return (
    <form
      className={`project-identity-form ${setup ? "project-identity-form--setup" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (normalizedArtist) onSubmit(normalizedArtist);
      }}
    >
      <label>
        Artist name
        <input
          autoFocus={setup}
          data-modal-autofocus={setup ? "true" : undefined}
          required
          maxLength={120}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Artist or band name"
          autoComplete="organization"
        />
      </label>
      <p>This name appears on every album layout and export. New albums inherit it automatically.</p>
      <button type="submit" className="primary-button" disabled={!normalizedArtist || (!setup && unchanged)}>
        {setup ? "Start Project" : "Save Project Settings"}
      </button>
    </form>
  );
}
