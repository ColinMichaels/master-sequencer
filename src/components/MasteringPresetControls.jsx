import React, { useEffect, useMemo, useRef, useState } from "react";

const EMPTY_PRESETS = Object.freeze([]);

export function MasteringPresetControls({ type, label, presets = EMPTY_PRESETS, prominent = false, inline = false, onSave, onLoad, onDelete }) {
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [notice, setNotice] = useState("");
  const detailsRef = useRef(null);
  const filteredPresets = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return presets;
    return presets.filter((preset) => preset.name.toLocaleLowerCase().includes(needle));
  }, [presets, query]);
  const selectedPreset = presets.find((preset) => preset.id === selectedId);

  useEffect(() => {
    if (selectedId && !presets.some((preset) => preset.id === selectedId)) setSelectedId("");
  }, [presets, selectedId]);

  useEffect(() => {
    if (!query.trim() || selectedId) return;
    const savedPreset = presets.find((preset) => preset.name.localeCompare(query.trim(), undefined, { sensitivity: "accent" }) === 0);
    if (savedPreset) setSelectedId(savedPreset.id);
  }, [presets, query, selectedId]);

  const closeMenu = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  const selectPreset = (event) => {
    const nextId = event.target.value;
    setSelectedId(nextId);
    if (nextId) setQuery(presets.find((preset) => preset.id === nextId)?.name || "");
    setDeleteArmed(false);
    setNotice("");
  };

  const updateQuery = (event) => {
    const nextQuery = event.target.value;
    const matchingPresets = presets.filter((preset) => preset.name.toLocaleLowerCase().includes(nextQuery.trim().toLocaleLowerCase()));
    setQuery(nextQuery);
    setSelectedId(nextQuery.trim() && matchingPresets.length === 1 ? matchingPresets[0].id : "");
    setDeleteArmed(false);
    setNotice("");
  };

  const savePreset = (event) => {
    event.preventDefault();
    const normalizedName = query.trim();
    if (!normalizedName) return;
    onSave(type, normalizedName);
    setDeleteArmed(false);
    setNotice(`${label} preset saved. Saving the same name updates it.`);
  };

  const loadPreset = () => {
    if (!selectedId) return;
    onLoad(type, selectedId);
    setDeleteArmed(false);
    setNotice(`${label} preset loaded.`);
    closeMenu();
  };

  const deletePreset = () => {
    if (!selectedId) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setNotice("Press confirm delete to remove this preset. Undo remains available.");
      return;
    }
    onDelete(type, selectedId);
    setSelectedId("");
    setQuery("");
    setDeleteArmed(false);
    setNotice(`${label} preset deleted.`);
    closeMenu();
  };

  const dismissMenu = (event) => {
    if (event.key !== "Escape" || !detailsRef.current?.open) return;
    event.preventDefault();
    closeMenu();
    detailsRef.current.querySelector("summary")?.focus();
  };

  return (
    <section className={`master-preset-controls ${prominent ? "master-preset-controls--prominent" : ""} ${inline ? "master-preset-controls--inline" : ""}`} aria-label={`${label} presets`}>
      <details ref={detailsRef} onKeyDown={dismissMenu}>
        <summary>
          <span><strong>{label} presets</strong><small>{selectedPreset?.name || `${presets.length} saved`}</small></span>
          <span className="master-preset-summary-action" aria-hidden="true" />
        </summary>
        <div className="master-preset-menu">
          <form className="master-preset-save" aria-label={`Search or save ${label} presets`} onSubmit={savePreset}>
            <label><span>Search or name a new preset</span><input maxLength="80" value={query} onChange={updateQuery} aria-label={`${label} preset search or name`} placeholder={`Search or name ${label}`} /></label>
            <button type="submit" disabled={!query.trim()}>Save current</button>
          </form>
          <div className="master-preset-recall">
            <label><span>{query.trim() ? "Matching presets" : "Saved presets"}</span><select aria-label={`${label} preset`} value={selectedId} onChange={selectPreset}><option value="">{filteredPresets.length ? `Choose ${label} preset` : `No matching ${label} presets`}</option>{filteredPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
            <button type="button" onClick={loadPreset} disabled={!selectedId}>Load</button>
            <button type="button" className={deleteArmed ? "is-armed" : ""} onClick={deletePreset} disabled={!selectedId}>{deleteArmed ? "Confirm delete" : "Delete"}</button>
          </div>
          <small className="master-preset-notice" role="status">{notice || `${presets.length} saved · project-wide`}</small>
        </div>
      </details>
    </section>
  );
}
