import React, { useEffect, useMemo, useState } from "react";
import { ADVANCED_PROCESSOR_CATALOG, ADVANCED_PROCESSOR_TYPES, ADVANCED_RACK_MAX_PROCESSORS, buildSerialConnections, createAdvancedProcessor, createDefaultAdvancedMastering, normalizeAdvancedMastering, processorDefinition } from "../lib/advanced-mastering.js";
import { MASTERING_LIMITS } from "../lib/mastering.js";
import { ChevronIcon, DragIcon, PlusIcon, RefreshIcon, TrashIcon } from "./Icons.jsx";
import { CompressorTransferGraph, EqResponseGraph, LimiterTransferGraph, ManualValues, MasteringNumberField, ModuleSwitch, RotaryControl } from "./MasteringControls.jsx";
import { MasterOutputMeters } from "./MasterOutputMeters.jsx";

const pathSet = (source, path, value) => {
  const next = structuredClone(source);
  let target = next;
  path.slice(0, -1).forEach((key) => { target = target[key]; });
  target[path.at(-1)] = value;
  return next;
};

const serialRack = (rack, nodes) => normalizeAdvancedMastering({ ...rack, nodes, connections: buildSerialConnections(nodes) });

const uniqueProcessorId = (rack, typeId) => {
  const base = processorDefinition(typeId)?.shortName.toLowerCase() || "unit";
  let index = 1;
  while (rack.nodes.some((node) => node.id === `${base}-${index}`)) index += 1;
  return `${base}-${index}`;
};

const Field = ({ label, value, limits, minimum, maximum, step = 0.1, suffix, disabled, onCommit }) => (
  <MasteringNumberField label={label} value={value} minimum={limits?.minimum ?? minimum} maximum={limits?.maximum ?? maximum} step={step} suffix={suffix} disabled={disabled} onCommit={onCommit} />
);

function EquipmentActions({ node, index, count, onMove, onDuplicate, onRemove, onBypass }) {
  return (
    <div className="premium-unit-actions">
      <ModuleSwitch label={`Enable ${node.name}`} checked={!node.bypass} onChange={(enabled) => onBypass(!enabled)} />
      <button type="button" aria-label={`Move ${node.name} up`} title="Move earlier in signal path" disabled={index === 0} onClick={() => onMove(index, index - 1)}><ChevronIcon direction="up" /></button>
      <button type="button" aria-label={`Move ${node.name} down`} title="Move later in signal path" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}><ChevronIcon direction="down" /></button>
      <button type="button" aria-label={`Duplicate ${node.name}`} title="Duplicate equipment" onClick={onDuplicate}><PlusIcon /></button>
      <button type="button" className="premium-unit-remove" aria-label={`Remove ${node.name}`} title="Remove equipment" onClick={onRemove}><TrashIcon /></button>
    </div>
  );
}

function PremiumEq({ node, disabled, onParameter, meteringRef, live }) {
  const eq = node.parameters;
  return (
    <>
      <div className="premium-faceplate premium-faceplate--eq">
        <div className="premium-brand"><span>SEQUENCER</span><strong>PROGRAM EQ</strong><small>Three-band mastering equalizer</small></div>
        <EqResponseGraph eq={eq} meteringRef={meteringRef} active={live && !disabled} />
        <div className="premium-knob-bank premium-knob-bank--eq">
          <RotaryControl label="Low frequency" value={eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["lowShelf", "frequencyHz"], value)} />
          <RotaryControl label="Low boost / cut" value={eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["lowShelf", "gainDb"], value)} />
          <RotaryControl label="Mid frequency" value={eq.midBand.frequencyHz} limits={MASTERING_LIMITS.midBandFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["midBand", "frequencyHz"], value)} />
          <RotaryControl label="Mid boost / cut" value={eq.midBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["midBand", "gainDb"], value)} />
          <RotaryControl label="Mid bandwidth" value={eq.midBand.q} limits={MASTERING_LIMITS.midBandQ} step={0.1} suffix="Q" precision={1} scale="log" disabled={disabled} onChange={(value) => onParameter(["midBand", "q"], value)} />
          <RotaryControl label="High frequency" value={eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" scale="log" disabled={disabled} onChange={(value) => onParameter(["highShelf", "frequencyHz"], value)} />
          <RotaryControl label="High boost / cut" value={eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["highShelf", "gainDb"], value)} />
        </div>
      </div>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <Field label="Low frequency" value={eq.lowShelf.frequencyHz} limits={MASTERING_LIMITS.lowShelfFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["lowShelf", "frequencyHz"], value)} />
        <Field label="Low gain" value={eq.lowShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["lowShelf", "gainDb"], value)} />
        <Field label="Mid frequency" value={eq.midBand.frequencyHz} limits={MASTERING_LIMITS.midBandFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["midBand", "frequencyHz"], value)} />
        <Field label="Mid gain" value={eq.midBand.gainDb} limits={MASTERING_LIMITS.eqGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["midBand", "gainDb"], value)} />
        <Field label="Mid Q" value={eq.midBand.q} limits={MASTERING_LIMITS.midBandQ} suffix="Q" disabled={disabled} onCommit={(value) => onParameter(["midBand", "q"], value)} />
        <Field label="High frequency" value={eq.highShelf.frequencyHz} limits={MASTERING_LIMITS.highShelfFrequencyHz} step={1} suffix="Hz" disabled={disabled} onCommit={(value) => onParameter(["highShelf", "frequencyHz"], value)} />
        <Field label="High gain" value={eq.highShelf.gainDb} limits={MASTERING_LIMITS.eqGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["highShelf", "gainDb"], value)} />
      </div></ManualValues>
    </>
  );
}

function PremiumCompressor({ node, disabled, onParameter, meteringRef, live }) {
  const compressor = node.parameters;
  return (
    <>
      <div className="premium-faceplate premium-faceplate--compressor">
        <div className="premium-brand"><span>SEQUENCER</span><strong>BUS COMPRESSOR</strong><small>Stereo mastering dynamics</small></div>
        <div className="premium-vu"><span>GAIN REDUCTION</span><i /><b>0</b><small>−20&nbsp;&nbsp;&nbsp;−10&nbsp;&nbsp;&nbsp;−5&nbsp;&nbsp;&nbsp;−3&nbsp;&nbsp;&nbsp;−1</small></div>
        <CompressorTransferGraph compressor={compressor} meteringRef={meteringRef} meterNodeKey={`processor:${node.id}:compressor`} active={live && !disabled} />
        <div className="premium-knob-bank premium-knob-bank--compressor">
          <RotaryControl label="Threshold" value={compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["thresholdDb"], value)} />
          <RotaryControl label="Ratio" value={compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} step={0.1} suffix=":1" precision={1} scale="log" disabled={disabled} onChange={(value) => onParameter(["ratio"], value)} />
          <RotaryControl label="Attack" value={compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} step={0.1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["attackMs"], value)} />
          <RotaryControl label="Release" value={compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["releaseMs"], value)} />
          <RotaryControl label="Makeup" value={compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["makeupGainDb"], value)} />
          <RotaryControl label="Parallel mix" value={Math.round(compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" precision={0} disabled={disabled} onChange={(value) => onParameter(["mix"], value / 100)} />
        </div>
      </div>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <Field label="Threshold" value={compressor.thresholdDb} limits={MASTERING_LIMITS.compressorThresholdDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["thresholdDb"], value)} />
        <Field label="Ratio" value={compressor.ratio} limits={MASTERING_LIMITS.compressorRatio} suffix=":1" disabled={disabled} onCommit={(value) => onParameter(["ratio"], value)} />
        <Field label="Attack" value={compressor.attackMs} limits={MASTERING_LIMITS.compressorAttackMs} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["attackMs"], value)} />
        <Field label="Release" value={compressor.releaseMs} limits={MASTERING_LIMITS.compressorReleaseMs} step={1} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["releaseMs"], value)} />
        <Field label="Knee" value={compressor.knee} limits={MASTERING_LIMITS.compressorKnee} suffix="" disabled={disabled} onCommit={(value) => onParameter(["knee"], value)} />
        <Field label="Makeup" value={compressor.makeupGainDb} limits={MASTERING_LIMITS.compressorMakeupGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["makeupGainDb"], value)} />
        <Field label="Mix" value={Math.round(compressor.mix * 100)} minimum={0} maximum={100} step={1} suffix="%" disabled={disabled} onCommit={(value) => onParameter(["mix"], value / 100)} />
        <label className="master-select-field"><span>Detection</span><select value={compressor.detection} disabled={disabled} onChange={(event) => onParameter(["detection"], event.target.value)}><option value="rms">RMS</option><option value="peak">Peak</option></select></label>
        <label className="master-select-field"><span>Stereo link</span><select value={compressor.link} disabled={disabled} onChange={(event) => onParameter(["link"], event.target.value)}><option value="maximum">Maximum</option><option value="average">Average</option></select></label>
      </div></ManualValues>
    </>
  );
}

function PremiumOutput({ node, disabled, onParameter }) {
  return <>
    <div className="premium-faceplate premium-faceplate--output"><div className="premium-brand"><span>SEQUENCER</span><strong>MASTER OUTPUT</strong><small>Calibrated line stage</small></div><RotaryControl label="Output level" value={node.parameters.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} step={0.1} suffix="dB" precision={1} disabled={disabled} onChange={(value) => onParameter(["outputGainDb"], value)} /><div className="premium-output-led"><i /><span>48 kHz / 24-bit print path</span></div></div>
    <ManualValues><div className="master-module-fields premium-exact-values"><Field label="Output level" value={node.parameters.outputGainDb} limits={MASTERING_LIMITS.outputGainDb} suffix="dB" disabled={disabled} onCommit={(value) => onParameter(["outputGainDb"], value)} /></div></ManualValues>
  </>;
}

function PremiumLimiter({ node, disabled, onParameter, meteringRef, live }) {
  const limiter = node.parameters;
  return (
    <>
      <div className="premium-faceplate premium-faceplate--limiter">
        <div className="premium-brand"><span>SEQUENCER</span><strong>PRECISION LIMITER</strong><small>{limiter.oversample}× oversampled final print</small></div>
        <LimiterTransferGraph limiter={limiter} meteringRef={meteringRef} meterNodeKey={`processor:${node.id}:limiter`} active={live && !disabled} />
        <div className="premium-knob-bank premium-knob-bank--limiter">
          <RotaryControl label="Ceiling" value={limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} step={0.1} suffix="dBFS" precision={1} disabled={disabled} onChange={(value) => onParameter(["ceilingDbfs"], value)} />
          <RotaryControl label="Attack" value={limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} step={0.1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["attackMs"], value)} />
          <RotaryControl label="Release" value={limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" scale="log" disabled={disabled} onChange={(value) => onParameter(["releaseMs"], value)} />
          <label className="premium-oversample"><span>Print quality</span><select value={limiter.oversample} disabled={disabled} onChange={(event) => onParameter(["oversample"], Number(event.target.value))}><option value="1">1× native</option><option value="2">2× oversampled</option><option value="4">4× oversampled</option></select><small>Live audition runs at the audio device rate.</small></label>
        </div>
      </div>
      <ManualValues><div className="master-module-fields premium-exact-values">
        <Field label="Ceiling" value={limiter.ceilingDbfs} limits={MASTERING_LIMITS.limiterCeilingDbfs} suffix="dBFS" disabled={disabled} onCommit={(value) => onParameter(["ceilingDbfs"], value)} />
        <Field label="Attack" value={limiter.attackMs} limits={MASTERING_LIMITS.limiterAttackMs} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["attackMs"], value)} />
        <Field label="Release" value={limiter.releaseMs} limits={MASTERING_LIMITS.limiterReleaseMs} step={1} suffix="ms" disabled={disabled} onCommit={(value) => onParameter(["releaseMs"], value)} />
      </div></ManualValues>
    </>
  );
}

function RackEquipment({ node, index, count, selected, rackBypassed, meteringRef, liveProcessing, playing, onSelect, onMove, onDuplicate, onRemove, onBypass, onParameter, onDragStart, onDrop }) {
  const definition = processorDefinition(node.typeId);
  const disabled = rackBypassed || node.bypass;
  const live = Boolean(liveProcessing && playing);
  return (
    <article className={`premium-rack-unit premium-rack-unit--${definition.accent} ${selected ? "is-selected" : ""} ${node.bypass ? "is-bypassed" : ""}`} draggable onDragStart={(event) => onDragStart(event, index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, index)} onClick={onSelect} aria-label={`${index + 1}. ${node.name}${node.bypass ? ", bypassed" : ""}`}>
      <span className="premium-rack-screw premium-rack-screw--tl" aria-hidden="true" /><span className="premium-rack-screw premium-rack-screw--tr" aria-hidden="true" /><span className="premium-rack-screw premium-rack-screw--bl" aria-hidden="true" /><span className="premium-rack-screw premium-rack-screw--br" aria-hidden="true" />
      <header className="premium-unit-heading"><div className="premium-drag-handle" title="Drag to repatch"><DragIcon /><span>{String(index + 1).padStart(2, "0")}</span></div><div><strong>{node.name}</strong><small>{definition.rackUnits}U hardware-style processor · {node.bypass ? "bypassed" : "in circuit"}</small></div><EquipmentActions node={node} index={index} count={count} onMove={onMove} onDuplicate={onDuplicate} onRemove={onRemove} onBypass={onBypass} /></header>
      {node.typeId === ADVANCED_PROCESSOR_TYPES.eq && <PremiumEq node={node} disabled={disabled} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.compressor && <PremiumCompressor node={node} disabled={disabled} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.output && <PremiumOutput node={node} disabled={disabled} onParameter={onParameter} />}
      {node.typeId === ADVANCED_PROCESSOR_TYPES.limiter && <PremiumLimiter node={node} disabled={disabled} onParameter={onParameter} meteringRef={meteringRef} live={live} />}
    </article>
  );
}

export function AdvancedMasteringRack({ rack, onChange, meteringRef, meteringAvailable, playing, liveProcessing, monitorLabel }) {
  const normalized = useMemo(() => normalizeAdvancedMastering(rack), [rack]);
  const [selectedId, setSelectedId] = useState(normalized.nodes[0]?.id || "");
  const [addType, setAddType] = useState(ADVANCED_PROCESSOR_TYPES.eq);
  const [dragIndex, setDragIndex] = useState(-1);
  useEffect(() => { if (!normalized.nodes.some((node) => node.id === selectedId)) setSelectedId(normalized.nodes[0]?.id || ""); }, [normalized.nodes, selectedId]);

  const commitNodes = (nodes) => onChange(serialRack(normalized, nodes));
  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= normalized.nodes.length || to >= normalized.nodes.length) return;
    const nodes = [...normalized.nodes];
    const [node] = nodes.splice(from, 1);
    nodes.splice(to, 0, node);
    commitNodes(nodes);
  };
  const updateNode = (id, recipe) => commitNodes(normalized.nodes.map((node) => node.id === id ? recipe(structuredClone(node)) : node));
  const add = () => {
    if (normalized.nodes.length >= ADVANCED_RACK_MAX_PROCESSORS) return;
    const node = createAdvancedProcessor(addType, uniqueProcessorId(normalized, addType));
    commitNodes([...normalized.nodes, node]);
    setSelectedId(node.id);
  };
  const duplicate = (node) => {
    if (normalized.nodes.length >= ADVANCED_RACK_MAX_PROCESSORS) return;
    const copy = { ...structuredClone(node), id: uniqueProcessorId(normalized, node.typeId), name: `${processorDefinition(node.typeId).name} Copy` };
    const index = normalized.nodes.findIndex((candidate) => candidate.id === node.id);
    const nodes = [...normalized.nodes];
    nodes.splice(index + 1, 0, copy);
    commitNodes(nodes);
    setSelectedId(copy.id);
  };
  const remove = (node) => commitNodes(normalized.nodes.filter((candidate) => candidate.id !== node.id));
  const activeCount = normalized.bypass ? 0 : normalized.nodes.filter((node) => !node.bypass).length;

  return (
    <section className={`premium-mastering-rack ${normalized.bypass ? "is-bypassed" : ""}`} aria-labelledby="premium-rack-title">
      <header className="premium-rack-heading">
        <div><span className="premium-badge">PREMIUM</span><div><h3 id="premium-rack-title">Advanced Mastering Rack</h3><p>Patchable serial hardware path · live audition follows rack order · final print is authoritative</p></div></div>
        <div className="premium-rack-master-actions"><strong>{normalized.bypass ? "Rack bypassed" : `${activeCount}/${normalized.nodes.length} units in circuit`}</strong><label className={`master-bypass-switch ${normalized.bypass ? "is-enabled" : ""}`}><input type="checkbox" checked={normalized.bypass} onChange={(event) => onChange({ ...normalized, bypass: event.target.checked })} /><span>Bypass rack</span></label><button type="button" className="text-button" onClick={() => { const reset = createDefaultAdvancedMastering(); onChange(reset); setSelectedId(reset.nodes[0].id); }}><RefreshIcon /> Reset rack</button></div>
      </header>

      <MasterOutputMeters meteringRef={meteringRef} available={meteringAvailable} playing={playing} monitorLabel={monitorLabel} />

      <div className="premium-rack-toolbar">
        <div><label><span>New equipment</span><select aria-label="Equipment to add" value={addType} onChange={(event) => setAddType(event.target.value)}>{ADVANCED_PROCESSOR_CATALOG.map((definition) => <option key={definition.typeId} value={definition.typeId}>{definition.name}</option>)}</select></label><button type="button" onClick={add} disabled={normalized.nodes.length >= ADVANCED_RACK_MAX_PROCESSORS}><PlusIcon /> Add to end of rack</button></div>
        <div className="premium-plugin-boundary"><span>VST3 / AU</span><strong>Native host connection</strong><small>Rack format is ready; plug-in execution requires the signed desktop host.</small></div>
      </div>

      <div className="premium-rack-layout">
        <aside className="premium-patch-bay" aria-label="Premium mastering patch order">
          <header><span>PATCH</span><div><strong>Signal Order</strong><small>Drag or use arrows</small></div></header>
          <ol>
            <li className="premium-patch-terminal"><i /><span><strong>INPUT</strong><small>Album program</small></span></li>
            {normalized.nodes.map((node, index) => {
              const definition = processorDefinition(node.typeId);
              return <li key={node.id} className={`${node.id === selectedId ? "is-selected" : ""} ${node.bypass ? "is-bypassed" : ""}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDragIndex(index); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); move(dragIndex, index); setDragIndex(-1); }}><button type="button" onClick={() => { setSelectedId(node.id); document.getElementById(`premium-unit-${node.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><i /><span><strong>{String(index + 1).padStart(2, "0")} · {definition.shortName}</strong><small>{node.name}</small></span><DragIcon /></button></li>;
            })}
            <li className="premium-patch-terminal"><i /><span><strong>OUTPUT</strong><small>Meter / print</small></span></li>
          </ol>
          <p>Each cable is rebuilt from top to bottom. Bypassed units stay in position but pass signal unchanged.</p>
        </aside>

        <div className="premium-equipment-rack" aria-label="Premium analog mastering equipment">
          {normalized.nodes.length ? normalized.nodes.map((node, index) => <div id={`premium-unit-${node.id}`} key={node.id}><RackEquipment node={node} index={index} count={normalized.nodes.length} selected={node.id === selectedId} rackBypassed={normalized.bypass} meteringRef={meteringRef} liveProcessing={liveProcessing} playing={playing} onSelect={() => setSelectedId(node.id)} onMove={move} onDuplicate={() => duplicate(node)} onRemove={() => remove(node)} onBypass={(bypass) => updateNode(node.id, (draft) => ({ ...draft, bypass }))} onParameter={(path, value) => updateNode(node.id, (draft) => ({ ...draft, parameters: pathSet(draft.parameters, path, value) }))} onDragStart={(event, from) => { event.dataTransfer.effectAllowed = "move"; setDragIndex(from); }} onDrop={(event, to) => { event.preventDefault(); move(dragIndex, to); setDragIndex(-1); }} /></div>) : <div className="premium-empty-rack"><strong>The rack is empty.</strong><p>Add any processor above. Input passes directly to output until equipment is inserted.</p></div>}
        </div>
      </div>
    </section>
  );
}
