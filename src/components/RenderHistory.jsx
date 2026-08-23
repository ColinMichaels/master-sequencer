import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { compareRenderManifests } from "../lib/delivery-profiles.js";
import { formatBytes } from "../lib/format.js";
import { DownloadIcon, RefreshIcon, WarningIcon } from "./Icons.jsx";
import { MasteringDisclosure } from "./MasteringDisclosure.jsx";
import { audioExportSummary } from "../lib/audio-export-settings.js";

export function RenderHistory() {
  const [renders, setRenders] = useState([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [comparison, setComparison] = useState([]);
  const [compared, setCompared] = useState(false);
  const [status, setStatus] = useState("Loading render history…");
  const [statusType, setStatusType] = useState("loading");

  const refresh = async () => {
    setStatus("Loading render history…");
    setStatusType("loading");
    try {
      const { jobs } = await api.listRenderJobs();
      const completed = jobs.filter((job) => job.status === "completed" && job.result?.manifestUrl);
      setRenders(completed);
      setCompared(false);
      setLeftId((current) => completed.some((job) => job.id === current) ? current : completed[0]?.id || "");
      setRightId((current) => completed.some((job) => job.id === current) ? current : completed[1]?.id || completed[0]?.id || "");
      setStatus(completed.length ? `${completed.length} documented render${completed.length === 1 ? "" : "s"} found.` : "No documented prints yet.");
      setStatusType("ready");
    } catch (error) {
      setStatus(error.message);
      setStatusType("error");
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
      setStatusType("ready");
    } catch (error) {
      setStatus(error.message);
      setStatusType("error");
    }
  };

  const summary = statusType === "loading" ? "Loading…" : statusType === "error" ? "Needs attention" : renders.length ? `${renders.length} documented print${renders.length === 1 ? "" : "s"}` : "No documented prints";

  return (
    <MasteringDisclosure id="render-history" className="render-history" title="Render History" description="Completed documented derivatives discovered under exports. Files are never deleted here." summary={summary} alert={statusType === "error" ? status : ""}>
      <div className="render-history-toolbar"><p className="render-history-status" role="status">{status}</p><button type="button" className="text-button" onClick={refresh}><RefreshIcon /> Refresh</button></div>
      {renders.length > 0 && <>
        <ol>{renders.map((job) => <li key={job.id}><div className="render-history-copy"><strong>{job.result.audioName}</strong><small>{new Date(job.completedAt || job.createdAt).toLocaleString()} · {audioExportSummary(job.result.audioSettings || job.result)} · {formatBytes(job.result.size)}{job.recovered ? " · rediscovered after restart" : ""}</small></div>{job.result.files?.length ? <details className="render-history-files"><summary>{job.result.files.length} Audio Files</summary><nav>{job.result.files.map((file) => <a key={file.trackId} href={file.audioUrl} download={file.audioName}><DownloadIcon /> {String(file.trackNumber).padStart(2, "0")} · {file.title}</a>)}</nav></details> : <a className="text-button" href={job.result.audioUrl} download={job.result.audioName}><DownloadIcon /> Audio</a>}<button type="button" className="text-button" onClick={async () => { try { await api.revealRender(job.result.id); setStatus("Render revealed in Finder."); } catch (error) { setStatus(error.message); } }}>Reveal in Finder</button></li>)}</ol>
        <div className="render-compare"><label>Earlier render<select value={leftId} onChange={(event) => { setLeftId(event.target.value); setCompared(false); }}>{renders.map((job) => <option key={job.id} value={job.id}>{job.result.audioName} · {new Date(job.createdAt).toLocaleTimeString()}</option>)}</select></label><label>Later render<select value={rightId} onChange={(event) => { setRightId(event.target.value); setCompared(false); }}>{renders.map((job) => <option key={job.id} value={job.id}>{job.result.audioName} · {new Date(job.createdAt).toLocaleTimeString()}</option>)}</select></label><button type="button" className="primary-button" disabled={!leftId || !rightId} onClick={compare}>Compare Manifests</button></div>
        {comparison.length > 0 ? <div className="manifest-diff" role="table">{comparison.map((row) => <div role="row" key={`${row.field}-${row.left}-${row.right}`}><strong role="cell">{row.field}</strong><span role="cell">{row.left}</span><span role="cell">{row.right}</span></div>)}</div> : leftId && rightId && <p className="render-history-empty"><WarningIcon /> {compared ? "No documented differences were found." : "Choose two renders and compare their documentation."}</p>}
      </>}
    </MasteringDisclosure>
  );
}
