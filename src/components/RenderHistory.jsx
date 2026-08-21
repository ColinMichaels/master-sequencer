import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { compareRenderManifests } from "../lib/delivery-profiles.js";
import { formatBytes } from "../lib/format.js";
import { DownloadIcon, RefreshIcon, WarningIcon } from "./Icons.jsx";

export function RenderHistory() {
  const [renders, setRenders] = useState([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [comparison, setComparison] = useState([]);
  const [compared, setCompared] = useState(false);
  const [status, setStatus] = useState("Loading render history…");

  const refresh = async () => {
    setStatus("Loading render history…");
    try {
      const { jobs } = await api.listRenderJobs();
      const completed = jobs.filter((job) => job.status === "completed" && job.result?.manifestUrl);
      setRenders(completed);
      setCompared(false);
      setLeftId((current) => completed.some((job) => job.id === current) ? current : completed[0]?.id || "");
      setRightId((current) => completed.some((job) => job.id === current) ? current : completed[1]?.id || completed[0]?.id || "");
      setStatus(completed.length ? `${completed.length} documented render${completed.length === 1 ? "" : "s"} found.` : "No documented prints yet.");
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => { refresh(); }, []);
  const byId = useMemo(() => new Map(renders.map((job) => [job.id, job])), [renders]);

  const compare = async () => {
    const left = byId.get(leftId)?.result;
    const right = byId.get(rightId)?.result;
    if (!left?.manifestUrl || !right?.manifestUrl) return;
    try {
      const [leftManifest, rightManifest] = await Promise.all([api.renderManifest(left.manifestUrl), api.renderManifest(right.manifestUrl)]);
      setComparison(compareRenderManifests(leftManifest, rightManifest));
      setCompared(true);
      setStatus("Render manifests compared.");
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <section className="render-history" aria-labelledby="render-history-title">
      <header><div><h3 id="render-history-title">Render History</h3><p>Completed documented derivatives discovered under exports. Files are never deleted here.</p></div><button type="button" className="text-button" onClick={refresh}><RefreshIcon /> Refresh</button></header>
      <p className="render-history-status" role="status">{status}</p>
      {renders.length > 0 && <>
        <ol>{renders.map((job) => <li key={job.id}><div><strong>{job.result.audioName}</strong><small>{new Date(job.completedAt || job.createdAt).toLocaleString()} · {job.result.format.toUpperCase()} · {formatBytes(job.result.size)}{job.recovered ? " · rediscovered after restart" : ""}</small></div><a className="text-button" href={job.result.audioUrl} download={job.result.audioName}><DownloadIcon /> Audio</a><button type="button" className="text-button" onClick={async () => { try { await api.revealRender(job.result.id); setStatus("Render revealed in Finder."); } catch (error) { setStatus(error.message); } }}>Reveal in Finder</button></li>)}</ol>
        <div className="render-compare"><label>Earlier render<select value={leftId} onChange={(event) => { setLeftId(event.target.value); setCompared(false); }}>{renders.map((job) => <option key={job.id} value={job.id}>{job.result.audioName} · {new Date(job.createdAt).toLocaleTimeString()}</option>)}</select></label><label>Later render<select value={rightId} onChange={(event) => { setRightId(event.target.value); setCompared(false); }}>{renders.map((job) => <option key={job.id} value={job.id}>{job.result.audioName} · {new Date(job.createdAt).toLocaleTimeString()}</option>)}</select></label><button type="button" className="primary-button" disabled={!leftId || !rightId} onClick={compare}>Compare Manifests</button></div>
        {comparison.length > 0 ? <div className="manifest-diff" role="table">{comparison.map((row) => <div role="row" key={`${row.field}-${row.left}-${row.right}`}><strong role="cell">{row.field}</strong><span role="cell">{row.left}</span><span role="cell">{row.right}</span></div>)}</div> : leftId && rightId && <p className="render-history-empty"><WarningIcon /> {compared ? "No documented differences were found." : "Choose two renders and compare their documentation."}</p>}
      </>}
    </section>
  );
}
