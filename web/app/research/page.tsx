"use client";

import { ChevronDown, Radio, TimerReset } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ScaleControl } from "@/components/ui/ScaleControl";
import { ResearchBlockProtocol } from "@/components/research/ResearchBlockProtocol";
import { ResearchCapturePanel } from "@/components/research/ResearchCapturePanel";
import { ResearchCredibilityPanel } from "@/components/research/ResearchCredibilityPanel";
import { ResearchDownstreamAnalysisCard } from "@/components/research/ResearchDownstreamAnalysisCard";
import { ResearchOfflineErpWorkflow } from "@/components/research/ResearchOfflineErpWorkflow";
import { ResearchConditioningLab } from "@/components/research/ResearchConditioningLab";
import { ResearchConnectivityVigilance } from "@/components/research/ResearchConnectivityVigilance";
import { ResearchContinuitySessionCard } from "@/components/research/ResearchContinuitySessionCard";
import { ResearchCytonAcquisitionCallout } from "@/components/research/ResearchCytonAcquisitionCallout";
import { ResearchDeviceContextPanel } from "@/components/research/ResearchDeviceContextPanel";
import { ResearchElectrodeQualityCard } from "@/components/research/ResearchElectrodeQualityCard";
import { ResearchEventLab } from "@/components/research/ResearchEventLab";
import { ResearchMethodsSamplingCard } from "@/components/research/ResearchMethodsSamplingCard";
import { ResearchFnirsMultiTrace } from "@/components/research/ResearchFnirsMultiTrace";
import { ResearchContactTrendStrip } from "@/components/research/ResearchContactTrendStrip";
import {
  BandValuePanel,
  MetricPanel,
  MetricRow,
  OscAddressRow,
  ResearchTile,
  StreamMeter,
} from "@/components/research/ResearchPageWidgets";
import { ResearchPpgWaveform } from "@/components/research/ResearchPpgWaveform";
import { ResearchRuleQcPanel } from "@/components/research/ResearchRuleQcPanel";
import { ResearchSessionHeaderCard } from "@/components/research/ResearchSessionHeaderCard";
import { ResearchTriggerTimingCard } from "@/components/research/ResearchTriggerTimingCard";
import { ResearchSignalConditioning } from "@/components/research/ResearchSignalConditioning";
import { useResearchPageModel } from "@/hooks/useResearchPageModel";
import { fmt, formatArgs } from "@/lib/researchFormat";
import { magnitude } from "@/lib/researchPageAnalysis";
import { RESEARCH_SECTION_NAV } from "@/lib/researchPageNav";
import { formatSpectralQcLine } from "@/lib/researchQc";

export default function ResearchPage() {
  const {
    wsStatus,
    deviceName,
    latestEEG,
    motion,
    packetCount,
    mindMonitorOsc,
    mindMonitorMode,
    estimatedEegHz,
    eegTraceSource,
    ageMs,
    live,
    mmOscCount,
    source,
    profile,
    eegOnlyHardware,
    rawStats,
    monitorBandsAbs,
    monitorBandsRel,
    displayTimestamp,
    displaySource,
    displayUpdateCount,
    displayRateMs,
    setDisplayRateMs,
    smoothing,
    setSmoothing,
    relBarScale,
    setRelBarScale,
    relBarDisplayGain,
    absDeltas,
    ppgMetrics,
    eegMetrics,
    spectralQc,
    frontalAlphaR,
    hrAlphaR,
    emgProxy,
    cardiacCoupling,
    plvAlpha,
    plvBeta,
    vigilance,
    fnirsMetrics,
    decodedMuse,
    ppgHistory,
    fnirsHistory,
    contactTrend,
    snapshot,
  } = useResearchPageModel();

  return (
    <div className="space-y-6">
      <nav
        aria-label="Research page sections"
        className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-1.5 rounded-lg border border-zinc-800/90 bg-zinc-950/90 px-2 py-2 shadow-sm shadow-black/20 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/80"
      >
        {RESEARCH_SECTION_NAV.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition hover:bg-zinc-800/80 hover:text-zinc-100"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div id="research-overview" className="scroll-mt-28 space-y-6">
        <ResearchSessionHeaderCard
          profile={profile}
          source={source}
          deviceLabel={deviceName ?? latestEEG?.deviceName ?? "--"}
          lastPacketAgeMs={ageMs}
          packetCount={packetCount}
          live={live}
          wsStatus={wsStatus}
        />

        <ResearchDeviceContextPanel
          profile={profile}
          estimatedEegHz={estimatedEegHz}
          eegTraceSource={eegTraceSource}
          motion={motion}
          live={live}
          mindMonitorOscAddresses={mmOscCount}
          mindMonitorMode={mindMonitorMode}
        />

        <ResearchCytonAcquisitionCallout profile={profile} />

        <div className="grid gap-6 xl:grid-cols-2">
          <ResearchMethodsSamplingCard
            profile={profile}
            estimatedEegHz={estimatedEegHz}
            eegTraceSource={eegTraceSource}
            deviceName={deviceName}
            live={live}
            mindMonitorMode={mindMonitorMode}
            mindMonitorOscAddressCount={mmOscCount}
          />
          <ResearchElectrodeQualityCard
            profile={profile}
            contact={decodedMuse.contact}
            channelLabels={profile.channelLabels}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ResearchCredibilityPanel />
          <ResearchOfflineErpWorkflow />
        </div>

        <ResearchContinuitySessionCard
          profile={profile}
          live={live}
          lastPacketAgeMs={ageMs}
          packetCount={packetCount}
          estimatedEegHz={estimatedEegHz}
        />
      </div>

      <div id="research-capture" className="scroll-mt-28 space-y-6">
        <ResearchCapturePanel />

        <ResearchEventLab />

        <ResearchTriggerTimingCard />

        <ResearchBlockProtocol />
      </div>

      <div id="research-analysis" className="scroll-mt-28 space-y-6">
        <ResearchConnectivityVigilance plvAlpha={plvAlpha} plvBeta={plvBeta} vigilance={vigilance} />

        <ResearchRuleQcPanel />

        <ResearchSignalConditioning />

        <ResearchConditioningLab />
      </div>

      <div id="research-live" className="scroll-mt-28 space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle icon={<Radio className="h-4 w-4" />}>Live Stream Activity</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <StreamMeter label="Raw EEG" value={rawStats.level} display={`${fmt(rawStats.rms)} µV RMS · span ${fmt(rawStats.span)}`} />
              {eegOnlyHardware ? (
                <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-500">
                  <span className="font-medium text-zinc-400">Non-EEG streams — not equipped. </span>
                  No accelerometer, gyro, PPG, or fNIRS on this device profile (e.g. OpenBCI Ganglion). IMU / optical
                  meters are hidden so lab workflows stay EEG-focused; use separate sensors if you need motion or pulse
                  covariates.
                </div>
              ) : (
                <>
                  <StreamMeter
                    label="Accelerometer"
                    value={profile.capabilities.imu ? magnitude(motion.accel ?? []) / 2 : 0}
                    display={profile.capabilities.imu ? undefined : "N/A · no IMU on this device"}
                  />
                  <StreamMeter
                    label="Gyro"
                    value={profile.capabilities.imu ? magnitude(motion.gyro ?? []) / 250 : 0}
                    display={profile.capabilities.imu ? undefined : "N/A · no IMU on this device"}
                  />
                  <StreamMeter
                    label="PPG / optical pulse"
                    value={profile.capabilities.ppg && ppgMetrics.range > 0 ? 0.65 : 0}
                    display={
                      profile.capabilities.ppg
                        ? ppgMetrics.bpm
                          ? `${Math.round(ppgMetrics.bpm)} BPM`
                          : "waveform below"
                        : "N/A · no optical PPG on this device"
                    }
                  />
                  <StreamMeter
                    label="fNIRS / optical"
                    value={profile.capabilities.fnirs ? magnitude(motion.fnirs ?? []) : 0}
                    display={profile.capabilities.fnirs ? undefined : "N/A · no fNIRS on this device"}
                  />
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle
                icon={<TimerReset className="h-4 w-4" />}
                description={`${displaySource} · display ${displayRateMs} ms · smoothing ${Math.round(smoothing * 100)}% · ${
                  displayTimestamp ? `${Math.max(0, Date.now() - displayTimestamp)} ms data age` : "waiting for band data"
                }`}
                actions={
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                    <label className="flex items-center gap-1">
                      Rate
                      <select
                        value={displayRateMs}
                        onChange={(event) => setDisplayRateMs(Number(event.target.value))}
                        className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-200"
                      >
                        <option value={100}>100ms</option>
                        <option value={250}>250ms</option>
                        <option value={500}>500ms</option>
                        <option value={1000}>1s</option>
                        <option value={2000}>2s</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1">
                      Smooth
                      <input
                        type="range"
                        min={0}
                        max={0.9}
                        step={0.05}
                        value={smoothing}
                        onChange={(event) => setSmoothing(Number(event.target.value))}
                        className="w-20 accent-emerald-500"
                      />
                    </label>
                  </div>
                }
              >
                Band Values Monitor
              </CardTitle>
            </CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <ScaleControl
                className="sm:col-span-2"
                compact
                state={relBarScale}
                onChange={setRelBarScale}
                min={50}
                max={500}
                unit="%"
                label="Relative bar scale"
                helpAuto="Bar length scales so the largest relative band uses most of the row (smoothed each update)."
                helpManual="Nominal gain: slider value ÷ 100 (100% = 1×, 250% = 2.5× bar length)."
              />
              <BandValuePanel
                title="Absolute Band Values"
                unit="dB"
                values={monitorBandsAbs}
                mode="absolute"
                updateCount={displayUpdateCount}
                deltas={absDeltas}
              />
              <BandValuePanel
                title="Relative Band Values"
                unit="%"
                values={monitorBandsRel}
                mode="relative"
                updateCount={displayUpdateCount}
                relativeVisualGain={relBarDisplayGain}
              />
            </CardBody>
          </Card>
        </div>

        {eegOnlyHardware ? (
          <Card className="border-zinc-800/80 opacity-95">
            <CardHeader>
              <CardTitle description="Ganglion-class hardware: EEG only in NeuroVis. Optical and IMU sections are collapsed.">
                PPG · IMU · fNIRS — not on this device
              </CardTitle>
            </CardHeader>
            <CardBody className="text-[11px] leading-relaxed text-zinc-500">
              OpenBCI Ganglion (and similar EEG-only paths) do not provide headset IMU, photoplethysmography, or fNIRS
              through this UI. Use the EEG panels, spectral QC, impedance checklist, and marker exports above; add external
              pulse or motion sensors if your protocol needs them.
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle
                  description={
                    profile.capabilities.ppg
                      ? "Optical photoplethysmography (PPG) — not ECG. Interval metrics are PPG-HRV-style only; do not report as ECG-HRV without a separate ECG. Best with direct Athena/BLE; Mind Monitor OSC may differ."
                      : "This hardware path has no optical PPG (e.g. OpenBCI Ganglion). Use a pulse oximeter or Muse S / Athena for heart-linked metrics."
                  }
                >
                  PPG-HRV-style (optical) · pulse &amp; intervals
                </CardTitle>
              </CardHeader>
              <CardBody className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                {profile.capabilities.ppg || ppgMetrics.range > 0 ? (
                  <>
                    <ResearchPpgWaveform samples={ppgHistory} channel={ppgMetrics.channel} beats={ppgMetrics.beats} />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <ResearchTile
                        label="Rate (PPG est.)"
                        value={ppgMetrics.bpm ? `${Math.round(ppgMetrics.bpm)} BPM` : "Calibrating"}
                      />
                      <ResearchTile
                        label="RMSSD (PPG-IBI)"
                        value={ppgMetrics.rmssd ? `${ppgMetrics.rmssd.toFixed(1)} ms` : "--"}
                      />
                      <ResearchTile
                        label="SDNN (PPG-IBI)"
                        value={ppgMetrics.sdnn ? `${ppgMetrics.sdnn.toFixed(1)} ms` : "--"}
                      />
                      <ResearchTile label="Pulse" value={ppgMetrics.beatActive ? "Beat" : ppgMetrics.beats.length ? "Tracking" : "Waiting"} />
                      <ResearchTile label="PPG channel" value={`CH ${ppgMetrics.channel + 1}`} />
                      <ResearchTile label="Signal quality" value={`${ppgMetrics.quality} · range ${fmt(ppgMetrics.range)}`} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500 lg:col-span-2">
                    No PPG stream expected for <span className="text-zinc-300">{profile.displayLabel}</span>. PPG-derived rhythm
                    metrics below are not applicable until a compatible optical path is connected.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle
                  description={
                    profile.capabilities.fnirs
                      ? "Raw multi-channel optical/aux time series (not automatic HbO/HbR). Athena direct bridge preferred; OSC path depends on Mind Monitor forwarding. Rolling alignment with EEG rows is fine for exploration; publication-grade optical series may need a dedicated native-rate export."
                      : "fNIRS / optical aux is not on this headset (e.g. Muse 2 — which still has accelerometer, gyro, and PPG when forwarded; Ganglion is EEG-focused here)."
                  }
                >
                  fNIRS / optical aux traces
                </CardTitle>
              </CardHeader>
              <CardBody>
                {profile.capabilities.fnirs ? (
                  <>
                    <ResearchFnirsMultiTrace samples={fnirsHistory} windowMs={60000} />
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Ingest:{" "}
                      <span className="text-zinc-400">
                        {profile.dataPath === "mind_monitor_osc"
                          ? "Mind Monitor OSC — verify addresses match your Athena optical streams."
                          : "Direct bridge — optical packets should match firmware/aux layout."}
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">
                    Not available on <span className="text-zinc-300">{profile.displayLabel}</span>.
                  </p>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      <div id="research-metrics" className="scroll-mt-28 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle description="Derived research readings for baseline-vs-task observation. These are exploratory wearable metrics, not clinical diagnoses.">
              Research Metrics
            </CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
            <MetricPanel title="EEG Cognitive Ratios">
              <MetricRow label="Theta / Beta" value={fmt(eegMetrics.thetaBeta, 3)} hint="attention / executive control marker" />
              <MetricRow label="Alpha / Theta" value={fmt(eegMetrics.alphaTheta, 3)} hint="relaxed wakefulness vs drowsiness" />
              <MetricRow label="Engagement" value={fmt(eegMetrics.engagement, 3)} hint="β / (α + θ)" />
              <MetricRow label="Fatigue index" value={fmt(eegMetrics.fatigue, 3)} hint="(θ + α) / β" />
            </MetricPanel>
            <MetricPanel title="EEG Asymmetry">
              <MetricRow
                label={`α asym (${profile.channelLabels[2]}–${profile.channelLabels[1]})`}
                value={fmt(eegMetrics.frontalAlphaAsym, 3)}
                hint={
                  profile.capabilities.museContactTiles
                    ? "log-power difference · index 2 vs 1 (Muse layout: AF8–AF7)"
                    : "log-power difference · Ch3 vs Ch2 in UI column order — map to scalp in methods"
                }
              />
              <MetricRow
                label={`α asym (${profile.channelLabels[3]}–${profile.channelLabels[0]})`}
                value={fmt(eegMetrics.temporalAlphaAsym, 3)}
                hint={
                  profile.capabilities.museContactTiles
                    ? "log-power difference · index 3 vs 0 (Muse layout: TP10–TP9)"
                    : "log-power difference · Ch4 vs Ch1 in UI column order — map to scalp in methods"
                }
              />
              <MetricRow label="Dominant band" value={eegMetrics.dominantBand ?? "--"} hint="largest relative share" />
              <MetricRow label="Quality" value={eegMetrics.quality} hint={eegMetrics.artifactHint} />
            </MetricPanel>
            {!eegOnlyHardware ? (
              <MetricPanel title="PPG-HRV-style (optical · not ECG)">
                <MetricRow
                  label="Rate (PPG)"
                  value={profile.capabilities.ppg ? (ppgMetrics.bpm ? `${Math.round(ppgMetrics.bpm)} BPM` : "--") : "N/A"}
                  hint="From optical pulse — not ECG R–R"
                />
                <MetricRow
                  label="RMSSD (PPG-IBI)"
                  value={profile.capabilities.ppg ? (ppgMetrics.rmssd ? `${ppgMetrics.rmssd.toFixed(1)} ms` : "--") : "N/A"}
                  hint="Successive PPG inter-beat intervals — do not call ECG-HRV"
                />
                <MetricRow
                  label="SDNN (PPG-IBI)"
                  value={profile.capabilities.ppg ? (ppgMetrics.sdnn ? `${ppgMetrics.sdnn.toFixed(1)} ms` : "--") : "N/A"}
                  hint="PPG beat-to-beat SD — optical, motion-sensitive"
                />
                <MetricRow
                  label="Beat intervals"
                  value={profile.capabilities.ppg ? String(ppgMetrics.intervals.length) : "N/A"}
                  hint={profile.capabilities.ppg ? ppgMetrics.quality : "no PPG on this device"}
                />
              </MetricPanel>
            ) : null}
            {!eegOnlyHardware ? (
              <MetricPanel title="fNIRS / optical trend">
                <MetricRow
                  label="HbO proxy"
                  value={profile.capabilities.fnirs ? fmt(fnirsMetrics.hbo, 4) : "N/A"}
                  hint="ch1 raw / vendor-defined"
                />
                <MetricRow
                  label="HbR proxy"
                  value={profile.capabilities.fnirs ? fmt(fnirsMetrics.hbr, 4) : "N/A"}
                  hint="ch2 raw / vendor-defined"
                />
                <MetricRow
                  label="HbT proxy"
                  value={profile.capabilities.fnirs ? fmt(fnirsMetrics.hbt, 4) : "N/A"}
                  hint="ch3 or sum proxy"
                />
                <MetricRow
                  label="Δλ1−λ2 (mean)"
                  value={profile.capabilities.fnirs ? fmt(fnirsMetrics.deltaOpticalProxy, 4) : "N/A"}
                  hint="coarse contrast — not validated ΔHbO−HbR"
                />
                <MetricRow
                  label="Trend"
                  value={profile.capabilities.fnirs ? fnirsMetrics.trendLabel : "N/A"}
                  hint={profile.capabilities.fnirs ? `${fmt(fnirsMetrics.slope, 5)} / min` : "no fNIRS on this device"}
                />
              </MetricPanel>
            ) : null}
            <MetricPanel title="Spectral QC">
              <MetricRow
                label="Line vs broadband"
                value={
                  spectralQc?.line_to_broadband_ratio != null
                    ? `${(spectralQc.line_to_broadband_ratio * 100).toFixed(2)}%`
                    : "—"
                }
                hint={
                  spectralQc
                    ? `${spectralQc.mains_hz} Hz band · ${spectralQc.source === "browser_psd" ? "Hamming PSD on raw ring buffer" : "WebSocket spectrum"}`
                    : "Need streaming EEG to fill raw buffers (~64+ samples/ch)"
                }
              />
              <MetricRow
                label="Line harmonics / broad"
                value={
                  spectralQc?.line_harmonic_ratio != null
                    ? `${(spectralQc.line_harmonic_ratio * 100).toFixed(2)}%`
                    : "—"
                }
                hint="~2× + ~3× mains vs broadband (if within Nyquist)"
              />
              <MetricRow
                label="1/f slope (log–log)"
                value={spectralQc?.log_slope_db_per_decade != null ? fmt(spectralQc.log_slope_db_per_decade, 3) : "—"}
                hint="2–35 Hz (clamped to Nyquist); exploratory"
              />
              <MetricRow
                label="1/f exponent proxy"
                value={spectralQc?.one_over_f_exponent_proxy != null ? fmt(spectralQc.one_over_f_exponent_proxy, 3) : "—"}
                hint="≈ −log–log slope of power (sign convention: exploratory)"
              />
              <MetricRow
                label="Summary"
                value={spectralQc ? spectralQc.flags.length ? spectralQc.flags.join(", ") : "ok" : "—"}
                hint={spectralQc ? formatSpectralQcLine(spectralQc) : ""}
              />
            </MetricPanel>
            <MetricPanel
              title="Coupling (4ch ceiling)"
              caption={
                eegOnlyHardware
                  ? "Heart–brain rows need optical PPG; Ganglion path leaves them N/A. Frontal α coupling still uses EEG only."
                  : profile.fourChannelUiCeiling
                    ? "Hardware may have >4 EEG channels; metrics use the first four only."
                    : undefined
              }
            >
              <MetricRow
                label={`Frontal α ${profile.channelLabels[1]}–${profile.channelLabels[2]} r`}
                value={frontalAlphaR != null ? fmt(frontalAlphaR, 3) : "—"}
                hint="Pearson r on recent α-filtered samples; not PLV"
              />
              <MetricRow
                label="HR ↔ α (PPG vs bands)"
                value={profile.capabilities.ppg ? (hrAlphaR != null ? fmt(hrAlphaR, 3) : "—") : "N/A"}
                hint={profile.capabilities.ppg ? "Aligned band history vs PPG amplitude; exploratory" : "no PPG"}
              />
              <MetricRow
                label="EMG proxy (γ+β)"
                value={emgProxy != null ? fmt(emgProxy, 3) : "—"}
                hint="high-frequency share of relative power"
              />
              <MetricRow
                label="Δ-frontal vs Δ-PPG r"
                value={cardiacCoupling.r != null ? fmt(cardiacCoupling.r, 3) : "—"}
                hint={cardiacCoupling.contaminationHint ?? "exploratory pulse / cardiac linkage"}
              />
            </MetricPanel>
          </CardBody>
        </Card>
      </div>

      <div id="research-downstream" className="scroll-mt-28">
        <ResearchDownstreamAnalysisCard />
      </div>

      <div id="research-reference" className="scroll-mt-28 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle description="What to capture for publishable or repeatable observations. Spikes are usually artifacts unless tied to a marked event; trends, baselines, epochs, and quality flags matter most.">
              Research Capture Priorities
            </CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ResearchTile label="Epochs" value="Baseline / task / recovery" />
            <ResearchTile label="Artifacts" value="Blink, jaw, motion, loose contact" />
            <ResearchTile label="Trends" value="Band ratios, PPG-IBI, fNIRS slope" />
            <ResearchTile label="Events" value="Markers for stimulus or action" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle
              description={
                profile.capabilities.museContactTiles
                  ? "Muse-layout decode: direct Athena/BLE fills EEG, motion, optical streams, battery when not using Mind Monitor OSC alone."
                  : "OpenBCI-style path: no Muse horseshoe decode — use raw EEG stats and lab impedance notes. Channel labels follow your montage above."
              }
            >
              {profile.capabilities.museContactTiles ? "Decoded Muse streams" : "EEG & motion summary (non-Muse)"}
            </CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {profile.capabilities.museContactTiles ? (
              <div className="md:col-span-2 xl:col-span-4">
                <ResearchContactTrendStrip samples={contactTrend} channelLabels={profile.channelLabels} />
              </div>
            ) : null}
            <ResearchTile label="Raw EEG RMS" value={fmt(decodedMuse.rawRms)} />
            <ResearchTile label="Raw EEG range" value={formatArgs(decodedMuse.rawRange)} />
            <ResearchTile label={`${profile.channelLabels[0]} contact`} value={decodedMuse.contact?.tp9 ?? "--"} />
            <ResearchTile label={`${profile.channelLabels[1]} contact`} value={decodedMuse.contact?.af7 ?? "--"} />
            <ResearchTile label={`${profile.channelLabels[2]} contact`} value={decodedMuse.contact?.af8 ?? "--"} />
            <ResearchTile label={`${profile.channelLabels[3]} contact`} value={decodedMuse.contact?.tp10 ?? "--"} />
            <ResearchTile label="Accel movement" value={fmt(decodedMuse.accelMovement)} />
            <ResearchTile label="Gyro movement" value={fmt(decodedMuse.gyroMovement)} />
            <ResearchTile label="PPG / optical pulse" value={decodedMuse.ppgPresent ? fmt(decodedMuse.ppgPulse) : "Not detected"} />
            <ResearchTile label="fNIRS / optical proxy" value={decodedMuse.fnirsPresent ? fmt(decodedMuse.fnirsProxy) : "Not detected"} />
            <ResearchTile label="Dominant band" value={decodedMuse.dominantBand ?? "--"} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle description="Mind Monitor OSC on UDP :5000 (when enabled). If you use direct MuseBridge/BLE, optical and EEG may bypass OSC — compare with the device & sensors path and this address list for duplicates or gaps.">
              Mind Monitor OSC inspector
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {Object.entries(mindMonitorOsc.addresses).length ? (
              Object.entries(mindMonitorOsc.addresses)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([address, info]) => <OscAddressRow key={address} address={address} info={info} />)
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-400">
                No raw Mind Monitor OSC addresses have reached the browser yet.
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <details
        id="research-snapshot"
        className="group scroll-mt-28 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40 open:border-zinc-700/90"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <div>
            <div className="text-sm font-medium text-zinc-100">Data Snapshot</div>
            <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">
              Full browser-side JSON for Csound / debug — collapsed by default.
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-zinc-800/90 px-4 pb-4 pt-2">
          <pre className="max-h-[520px] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] leading-5 text-zinc-400">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}
