# NeuroVis Development Roadmap

**Mission:** Build a scientifically rigorous brain-computer music interface supporting real-time acquisition, data playback, and reproducible research.

**Core Principle:** This system serves **three audiences**:

- 🎵 **Musicians/Artists** - Creative brain-music exploration
- 🎓 **Researchers** - Reproducible neuroscience experiments
- 🩺 **Clinicians** - Medical data visualization and sonification

**Status:** Active development | Last updated: April 17, 2026

---

## 🚨 Current Priority (In Progress)

### 1. Hardware Band Powers Streaming (CRITICAL)

**Status:** ⚠️ Debugging  
**Problem:** Muse hardware connects but band powers not reaching server  
**Root cause:** LibMuse SDK has no generic `bandPowers` packet type - must register for 5 separate types (`alphaAbsolute`, `betaAbsolute`, `deltaAbsolute`, `thetaAbsolute`, `gammaAbsolute`)  
**Solution:** Rewritten MuseBridge to accumulate 5 packets → calculate relative band powers  
**Next:** Test with real Muse S Athena hardware

### 2. Calibration System Integration

**Status:** 📋 Planned  
**User has working calibration code** - integrate after OSC testing complete  
**Features:**

- Baseline recording (eyes open/closed)
- Per-user normalization
- Artifact rejection thresholds
- Save/load calibration profiles

---

## ✅ Recently Completed

### Scientific Integrity Fixes (Apr 17, 2026)

- ✅ **UI simulator toggle now communicates with backend** (was only changing visual state)
- ✅ **OSC master on/off toggle** (2-layer safety: data source + OSC enable)
- ✅ **OSC stops sending when no active data source** (no phantom signals)
- ✅ **Csound set as primary/default OSC target** (port 7400)
- ✅ **UI improvements** (brain icon 🧠, larger fonts, QUAD VIEW in header)
- ✅ **Comprehensive documentation** (README-CSOUND-INTEGRATION.md)

### Git Commits

```
05a25c8 - fix: add OSC master toggle - enforce 2-layer safety for scientific integrity
d540f55 - fix: CRITICAL - enforce scientific integrity in OSC data flow
0a87141 - feat: Csound-first OSC integration with comprehensive UI improvements
```

---

## 🔬 Phase 1: Scientific Validation & Signal Processing

### 1.1 Enhanced Simulator - Signal Generator Mode

**Goal:** Transform simulator from "fake data" to "precision test signal generator"

**Simulator Modes:**

- `random` - Current behavior (random walk for visual testing)
- `sine_alpha` - Pure 10 Hz sine wave → validate alpha band detection accuracy
- `sine_beta` - Pure 20 Hz sine wave → validate beta band detection
- `sine_sweep` - 1-50 Hz frequency sweep → validate all band separations
- `step_function` - Instant 0→1 step → measure filter/smoothing response time
- `impulse` - Brief spike → test artifact handling and rejection
- `white_noise` - Broadband noise → validate bandpass filter (1-50 Hz)
- `60hz_noise` - 60 Hz contamination → validate notch filter effectiveness
- `real_brain` - Load pre-recorded real EEG snippet (known ground truth)

**Validation Metrics:**

- **Filter response time** - How long to settle after step input?
- **Band separation accuracy** - Pure alpha signal → 100% alpha, 0% others?
- **Smoothing lag** - EMA vs moving average response curves
- **OSC timing jitter** - Packet arrival variance at 10 Hz target rate
- **Latency measurement** - Timestamp sent vs received in Csound

**Output:**

- JSON validation report: `{"filter_response_ms": 45, "alpha_accuracy": 0.98, "osc_jitter_ms": 2.1}`
- Pass/fail criteria for each subsystem
- Automated regression testing

**Why this matters:**  
Before using real brain data in experiments, you must **prove the signal chain works correctly** with known inputs. This makes NeuroVis a validated scientific instrument, not just a toy.

---

### 1.2 Advanced Filtering & Signal Processing

**Goal:** Professional-grade DSP with transparent documentation

**Features:**

- [ ] **Multi-notch filter** (50/60 Hz harmonics: 120 Hz, 180 Hz)
- [ ] **Configurable bandpass** (user sets low/high cutoff)
- [ ] **IIR vs FIR filter comparison** (show frequency response curves)
- [ ] **Adaptive artifact rejection** (auto-detect muscle tension, blinks)
- [ ] **DC offset removal** (per-channel baseline correction)
- [ ] **Independent Component Analysis (ICA)** - separate brain sources

**Validation:**

- Export filter coefficients (for paper's Methods section)
- Show frequency response plots (validate -3dB points)
- Report group delay (is latency acceptable for real-time music?)

**UI:**

- Real-time FFT with overlay showing filter passband
- Before/after comparison (raw vs filtered)
- Export processing pipeline as diagram (for publications)

---

### 1.3 Data Quality Metrics & Reporting

**Goal:** Know when data is trustworthy

**Metrics:**

- **Signal-to-Noise Ratio (SNR)** per channel
- **Electrode impedance** (contact quality)
- **Artifact percentage** (% of data rejected)
- **Spectral entropy** (measure of signal complexity)
- **Alpha peak frequency** (individual alpha varies 8-12 Hz)

**Real-time indicators:**

- Green/yellow/red quality badges per channel
- Alert when >20% artifacts detected
- Warn if contact quality degrades mid-session

**Session reports:**

- "Data quality: 87% (good for analysis)"
- "TP9 electrode had poor contact 12:34-12:38"
- Export quality log with timestamps

---

## 🎵 Phase 2: Brain Player Mode (Data Playback)

### 2.1 CSV Import & Playback Engine

**Goal:** Load and replay any EEG/biometric CSV dataset

**Supported formats:**

- **OpenBCI format** (8-16 channels, timestamps, aux data)
- **Muse format** (4 channels + band powers)
- **EDF/EDF+ medical standard** (European Data Format)
- **BDF** (BioSemi Data Format - 24-bit precision)
- **PhysioNet WFDB** (WaveForm DataBase)
- **Generic CSV** (auto-detect columns: time, ch1, ch2, ...)

**Auto-detection:**

- Parse first 10 rows → infer format
- "Found 4 EEG channels at 256 Hz, duration 15:32"
- Map columns to NeuroVis channels automatically

**Playback controls:**

- ⏯️ Play/Pause
- ⏮️⏭️ Previous/Next annotation
- 🔁 Loop region (A-B repeat)
- 🎚️ Speed: 0.25x, 0.5x, 1x, 2x, 4x, 10x
- 📍 Scrub timeline (jump to t=5min)
- 📊 Waveform overview with playhead

**Memory efficiency:**

- Stream large files (don't load all into RAM)
- On-the-fly resampling (256 Hz → 10 Hz for band powers)
- Buffer 10 seconds ahead of playhead

---

### 2.2 Public Dataset Integration

**Goal:** One-click access to scientific datasets

**Curated library:**

- **Seizure detection** (Epilepsy EEG from PhysioNet)
- **Sleep stages** (PSG polysomnography data)
- **ADHD vs control** (Resting-state EEG comparison)
- **Meditation experts** (High alpha/theta during deep states)
- **Stroke recovery** (Longitudinal data over weeks)
- **Arrhythmia database** (ECG from MIT-BIH)
- **Dementia progression** (EEG changes in Alzheimer's)

**UI:**

- Browse by category: Clinical | Research | Music | Education
- Preview: "Epileptic seizure (22s duration, 4 channels, 256 Hz)"
- Download + auto-import (cache locally)
- Cite button (copy BibTeX for proper attribution)

**Example:**

```
Dataset: "Epileptic Seizure Recognition" (UCI Machine Learning Repo)
Files: 500 subjects × 23.6s clips = 11,500 samples
Classes: Seizure, tumor, healthy, eyes open, eyes closed
Format: CSV (4097 samples @ 173.6 Hz)
License: CC BY 4.0
```

**Why this matters:**  
Students can **hear what a seizure sounds like** when sonified. Researchers can **validate algorithms** on benchmark datasets. Artists can **use medical data as creative material** (with proper ethics).

---

### 2.3 Multi-File A/B Comparison

**Goal:** Compare two datasets side-by-side

**Use cases:**

- **Healthy vs Clinical** - Load normal EEG vs epilepsy → hear the difference
- **Pre vs Post treatment** - Did medication change brain patterns?
- **Self vs Expert meditator** - How does your alpha compare to monks?
- **Left vs Right hemisphere** - After stroke, is one side recovering faster?

**UI:**

- Split-screen waveforms (synchronized playback)
- Dual OSC streams to Csound (L=dataset A, R=dataset B)
- Difference plot (B - A) highlights changes
- Statistical comparison (t-test on band powers)

**Csound integration:**

- `/muse/A/alpha_absolute` and `/muse/B/alpha_absolute`
- Spatialize: Dataset A = left speaker, B = right speaker
- Or: Blend mode (morph between A and B over time)

---

### 2.4 Annotation & Event Marking

**Goal:** Navigate to important moments in long recordings

**Features:**

- **Load annotations** from CSV/JSON
  - "Seizure onset at t=45.2s"
  - "Eyes closed at t=120s"
  - "Medication administered at t=300s"
- **Create annotations** during playback
  - Mark interesting moments (artist mode)
  - Tag artifacts for removal (QA mode)
- **Jump to events** (dropdown or timeline markers)
- **Export annotated segments** (save just the seizure part)

**Format:**

```json
{
  "annotations": [
    { "time": 45.2, "label": "Seizure onset", "type": "clinical" },
    { "time": 67.8, "label": "Seizure end", "type": "clinical" },
    { "time": 120.0, "label": "Eyes closed", "type": "task" }
  ]
}
```

---

### 2.5 Export & Sharing

**Goal:** Share your discoveries with the world

**Export options:**

- **WAV file** - Rendered Csound output (sonification)
- **OSC recording** - Timestamped OSC messages (replay in any DAW)
- **Filtered CSV** - Cleaned data (with artifacts removed)
- **Jupyter notebook** - Pre-filled analysis code (Python/MNE-Python)
- **Session bundle** - ZIP with data + settings + annotations

**Reproducibility:**

- Include `metadata.json` with all filter settings, versions
- "Created with NeuroVis v1.2.3, Csound 7.0, MuseBridge 8.0.5"
- Link to exact Git commit SHA for perfect reproducibility

---

## 🩺 Phase 3: Clinical & Research Features

### 3.1 Multi-Subject Database

**Goal:** Manage hundreds of recordings

**Features:**

- **Subject metadata** (age, gender, diagnosis, medication)
- **Session tagging** (baseline, eyes open, meditation, music listening)
- **Search/filter** ("Show all ADHD subjects, eyes closed, age 20-30")
- **Batch processing** ("Calculate average alpha for all subjects")

**Database schema:**

```sql
subjects (id, name, age, diagnosis, notes)
sessions (id, subject_id, timestamp, duration, device_type)
recordings (id, session_id, filepath, sample_rate, channels)
annotations (id, recording_id, time, label, type)
```

**UI:**

- Subject list (sortable, filterable)
- Session timeline (calendar view)
- Quick stats: "87 subjects, 423 sessions, 156 hours recorded"

---

### 3.2 Group Analysis & Statistics

**Goal:** Population-level insights

**Features:**

- **Grand average** - Average EEG across all subjects
- **Condition comparison** - ADHD vs control (t-test)
- **Correlation analysis** - Alpha power vs self-reported stress
- **Longitudinal tracking** - Plot alpha over weeks of meditation practice

**Visualizations:**

- Box plots (alpha distribution across groups)
- Time series (how alpha changes over session)
- Topographic maps (which electrodes differ most?)
- Statistical significance markers (p < 0.05)

**Export:**

- CSV of summary statistics (mean, std, p-value per band)
- Plots as PNG/SVG for papers
- LaTeX tables (copy-paste into paper draft)

---

### 3.3 Protocol Templates & Experiments

**Goal:** Standardize data collection

**Built-in protocols:**

- **Resting state** (2 min eyes open, 2 min eyes closed)
- **Meditation baseline** (5 min breath focus)
- **Stress induction** (math task, Stroop test)
- **Music listening** (20 min classical vs EDM)

**Custom protocols:**

- Define sequence: "30s baseline → 60s stimulus → 30s recovery"
- Auto-annotate (mark stimulus onset/offset)
- Countdown timer in UI
- Beep/flash to signal subject (optional)

**Why this matters:**  
Consistent protocols = comparable results across studies. Essential for reproducibility.

---

## 🎨 Phase 4: Creative & Educational Features

### 4.1 Preset Library - Brain-Music Mappings

**Goal:** Curated collection of proven sonification strategies

**Categories:**

- **Meditation** (alpha → reverb, theta → sub-bass)
- **Focus** (beta → brightness, artifacts → silence)
- **Sleep** (delta → drones, slow LFO)
- **Biofeedback training** (hit alpha target → reward tone)
- **Generative music** (band ratios control Markov chains)

**Each preset includes:**

- Csound .csd file
- Description of mapping strategy
- Recommended use case (clinical vs artistic)
- Demo video (what it sounds like)
- Attribution (who created it?)

**Share presets:**

- Upload to community library
- Vote/rate (5-star system)
- Remix others' presets (fork + modify)

---

### 4.2 Educational Modules

**Goal:** Teach neuroscience through sound

**Interactive lessons:**

1. **"What is Alpha?"** - Load example → hear pure 10 Hz tone → compare to your alpha
2. **"How Filters Work"** - Toggle notch filter on/off → hear 60 Hz disappear
3. **"Meditation Changes Your Brain"** - Compare meditator vs beginner alpha
4. **"What Does a Seizure Sound Like?"** - Clinical data sonification

**Quizzes:**

- "Listen to 3 clips - which one is a seizure?"
- "Match brain state (alert/drowsy/sleep) to band power ratios"

**Target audience:**

- High school students (STEM education)
- Undergrad neuroscience courses
- Patient education (explain their own EEG results)

---

### 4.3 Performance Mode - Live Brain Music

**Goal:** Use NeuroVis on stage

**Features:**

- **Fullscreen visualization** (no clutter, just pretty waves)
- **MIDI out** (brain → MIDI notes → synthesizers)
- **Multi-OSC targets** (send to Ableton, Max/MSP, TouchDesigner simultaneously)
- **Preset switching** (foot pedal changes mapping mid-performance)
- **Recording + sync to DAW** (timestamped for post-production)

**Safety:**

- "Stage mode" - disable settings changes (don't accidentally break it live!)
- Redundancy - if Muse disconnects, fade to backup audio (not silence)
- Visual cues - show performer when alpha is "in the zone"

**Famous use case:**  
Alvin Lucier's _Music for Solo Performer_ (1965) - alpha waves trigger percussion. NeuroVis makes this accessible to anyone.

---

## 🔧 Phase 5: Infrastructure & Developer Tools

### 5.1 Plugin Architecture

**Goal:** Extensibility without forking

**Plugin types:**

- **Data sources** (new EEG devices, fitness trackers, ECG monitors)
- **Processing modules** (ICA, wavelet transform, machine learning)
- **Visualizations** (3D brain rendering, VR integration)
- **Export formats** (new file types, cloud storage)

**API:**

```javascript
NeuroVis.registerPlugin({
  name: "OpenBCI Cyton",
  type: "dataSource",
  connect: async (config) => {
    /* ... */
  },
  stream: (callback) => {
    /* ... */
  },
});
```

**Marketplace:**

- Browse community plugins
- One-click install (npm-style)
- Auto-update notifications

---

### 5.2 Python API - Programmatic Control

**Goal:** Headless operation for research pipelines

**Use case:**

```python
import neurovis

# Load dataset
session = neurovis.load_csv("subject_042_baseline.csv")

# Apply processing
session.filter(notch=60, bandpass=(1, 50))
session.smooth(method="ema", alpha=0.1)

# Extract features
alpha_power = session.band_power("alpha")
print(f"Mean alpha: {alpha_power.mean()}")

# Send to Csound
session.stream_osc(port=7400, rate=10)
```

**Batch processing:**

```bash
# Process all files in directory
neurovis process ./data/*.csv --filter notch=60 --output ./processed/
```

---

### 5.3 Cloud Integration (Optional Future)

**Goal:** Remote collaboration & storage

**Features:**

- **Cloud storage** (Google Drive, Dropbox sync)
- **Shared datasets** (collaborators access same data)
- **Remote rendering** (heavy Csound processing on server)
- **Live streaming** (performer in NYC, audience listens in Tokyo)

**Privacy:**

- End-to-end encryption for clinical data
- HIPAA compliance mode (no cloud sync, local only)
- Anonymization tools (strip PII from exports)

---

## 🌐 Phase 6: Open Science & Community

### 6.1 Dataset Contribution Portal

**Goal:** Users share their data (with consent)

**Workflow:**

1. User records EEG session
2. Anonymize (remove name, timestamps, metadata)
3. Add CC license (CC0, CC-BY, etc.)
4. Upload to NeuroVis dataset library
5. Get DOI (permanent identifier for citations)

**Quality control:**

- Automated checks (sample rate, channel count, duration)
- Community reviews (upvote quality datasets)
- Curator approval for featured datasets

**Ethical guidelines:**

- Informed consent templates
- IRB-approved data sharing checklists
- Privacy risk assessment

---

### 6.2 Reproducible Research - Open Pipeline

**Goal:** Every analysis step is transparent and repeatable

**Best practices:**

- **Version control** (Git for data + code)
- **Container images** (Docker with exact NeuroVis version)
- **Workflow documentation** (auto-generate from UI actions)
- **Pre-registration** (declare analysis plan before looking at data)

**Output:**

```
NeuroVis Analysis Pipeline v1.0
===============================
1. Load: subject_042_baseline.csv (4 ch, 256 Hz, 5:23 duration)
2. Filter: Notch 60 Hz (Q=30), Bandpass 1-50 Hz (4th-order Butterworth)
3. Artifact: Reject >100µV, reject blink (ICA component 1)
4. Band powers: Welch method (4s windows, 50% overlap)
5. Export: alpha_timeseries.csv
6. Statistics: Mean alpha = 0.342 ± 0.087 (n=323 windows)

Software versions:
- NeuroVis: 1.2.3 (commit d540f55)
- MuseBridge: 8.0.5
- Csound: 7.0.1
- Node.js: 18.16.0

Executed: 2026-04-17 20:30:42 UTC
Duration: 12.4 seconds
```

**Share this with your paper** → anyone can reproduce results exactly.

---

### 6.3 Teaching Resources & Workshops

**Goal:** Grow the community

**Materials:**

- **Video tutorials** (YouTube playlist)
- **Written guides** (blog posts, Medium articles)
- **Workshop curriculum** (4-hour intro to brain-music)
- **Course assignments** (university-ready problem sets)

**Workshops:**

- _Intro to EEG_ (1 hour) - Basics for musicians
- _Scientific Rigor_ (2 hours) - Filters, artifacts, statistics
- _Creative Coding_ (3 hours) - Custom Csound mappings
- _Clinical Applications_ (2 hours) - Medical data sonification

**Certification:**

- "NeuroVis Certified Practitioner"
- Demonstrate competency (pass quiz + project)
- Listed in community directory

---

## 🛠️ Technical Debt & Maintenance

### Known Issues

- [ ] UI simulator toggle now works, but default state should load from backend on page load
- [ ] Batch WebSocket broadcasts (throttle to 10 Hz not 256 Hz)
- [ ] Error handling for malformed CSV files
- [ ] Memory leak in long sessions (GC old band power buffers)
- [ ] OSC client reconnect logic (if Csound restarts)

### Code Quality

- [ ] Add TypeScript types (server + UI)
- [ ] Unit tests (target: 80% coverage)
- [ ] Integration tests (end-to-end OSC flow)
- [ ] Linting (ESLint + Prettier)
- [ ] API documentation (JSDoc → auto-generate docs)

### Performance

- [ ] Optimize FFT (use FFT.js instead of naive DFT)
- [ ] Web Worker for heavy processing (don't block UI)
- [ ] Reduce bundle size (tree-shake unused modules)
- [ ] Lazy load visualizations (don't render off-screen panels)

---

## 📅 Timeline (Rough Estimates)

**Phase 1 (Scientific Validation):** 2-3 weeks

- Enhanced simulator: 1 week
- Advanced filtering: 1 week
- Quality metrics: 3 days

**Phase 2 (Brain Player Mode):** 4-6 weeks

- CSV import: 1 week
- Public datasets: 1 week
- Playback controls: 1 week
- A/B comparison: 1 week
- Annotations: 3 days
- Export: 3 days

**Phase 3 (Clinical/Research):** 3-4 weeks

- Multi-subject DB: 1 week
- Group analysis: 1 week
- Protocol templates: 1 week

**Phase 4 (Creative/Educational):** 2-3 weeks

- Preset library: 1 week
- Educational modules: 1 week
- Performance mode: 3 days

**Phase 5 (Infrastructure):** 4-6 weeks

- Plugin architecture: 2 weeks
- Python API: 1 week
- Cloud integration: 2 weeks (optional)

**Phase 6 (Open Science):** Ongoing

- Community building
- Dataset curation
- Teaching resources

---

## 🤝 How to Contribute

### For Developers

1. Read `CONTRIBUTING.md` (coding standards, Git workflow)
2. Check `Issues` for "good first issue" tags
3. Fork → branch → PR with tests
4. Follow semantic versioning (semver)

### For Researchers

1. Share datasets (see Phase 6.1)
2. Report bugs when analyzing your data
3. Request features (scientific use cases)
4. Cite NeuroVis in publications

### For Artists/Musicians

1. Share Csound presets (brain-music mappings)
2. Document creative workflows (blog posts, videos)
3. Perform with NeuroVis (link to recordings)
4. Teach workshops (spread the knowledge)

### For Clinicians

1. Validate with real patients (case studies)
2. Report usability issues (clinical workflow)
3. Suggest medical datasets (anonymized)
4. Contribute to ethical guidelines

---

## 📚 Related Projects & Inspiration

**EEG Software:**

- OpenBCI GUI (open-source EEG visualization)
- BrainVision Analyzer (commercial, clinical-grade)
- EEGLAB (MATLAB toolbox, research standard)
- MNE-Python (Python library, publication quality)

**Sonification:**

- Alvin Lucier - _Music for Solo Performer_ (1965)
- David Rosenboom - _Brainwave Music_ (1970s)
- Eduardo Miranda - _BCMI-Piano_ (brain-computer music interface)
- Atau Tanaka - _BioMuse_ (muscle/brain control)

**Open Datasets:**

- PhysioNet (MIT, medical time series)
- OpenNeuro (Stanford, neuroimaging + EEG)
- EEGNet (benchmark for machine learning)
- Kaggle EEG competitions

**Csound Community:**

- The Csound Book (MIT Press, 2000) - **by Richard Boulanger** 🎓
- Csound FLOSS Manual (free, comprehensive)
- Cabbage (Csound → VST/AU plugin)

---

## 📖 Documentation Todos

- [ ] **User Guide** (getting started, tutorials)
- [ ] **Developer Guide** (architecture, API reference)
- [ ] **Scientific Methods** (filter specs, validation results)
- [ ] **Ethical Guidelines** (data sharing, consent, privacy)
- [ ] **FAQ** (common questions)
- [ ] **Troubleshooting** (Muse won't connect? OSC not working?)
- [ ] **Changelog** (what changed in each version?)

---

## 🎓 Academic Goals

**Publications:**

- "NeuroVis: An Open-Source Platform for Real-Time EEG Sonification" (NIME)
- "Reproducible Neuroscience with NeuroVis Data Playback" (Journal of Open Source Software)
- "Clinical Data Sonification for Patient Education" (Medical Informatics)

**Workshops:**

- NIME (New Interfaces for Musical Expression)
- ICAD (International Conference on Auditory Display)
- Society for Neuroscience annual meeting
- Music & Health conferences

**Grants:**

- NIH R01 (clinical applications)
- NSF SBIR (commercial development)
- Arts councils (creative sonification)

---

## 💡 Long-Term Vision (5-10 Years)

**NeuroVis becomes:**

1. **The standard** for brain-music research (cited in 100+ papers)
2. **Teaching tool** in 50+ universities (undergrad neuroscience courses)
3. **Clinical aid** (hospitals use it for patient education)
4. **Creative platform** (artists release brain-music albums)
5. **Open dataset hub** (10,000+ publicly available EEG recordings)

**Impact metrics:**

- 10,000+ users worldwide
- 500+ contributed datasets
- 200+ scientific publications using NeuroVis
- 50+ musical performances/albums
- 25+ university courses
- 10+ clinical trials

---

## 🙏 Acknowledgments

**Creators:**

- Richard Boulanger (The Csound Book, MIT Press)
- DrC AI Assistant (OpenCode)

**Technologies:**

- LibMuse SDK 8.0.5 (Muse EEG devices)
- Csound 7+ (real-time audio synthesis)
- Node.js + WebSocket (backend)
- React (frontend)
- OSC (Open Sound Control protocol)

**Community:**

- Csound community (40+ years of audio innovation)
- Open-source EEG researchers (OpenBCI, MNE-Python)
- Brain-music pioneers (Lucier, Rosenboom, Miranda, Tanaka)

---

**Last updated:** April 17, 2026  
**Repository:** https://github.com/csounder/neurovis-eeg-dashboard  
**License:** (TBD - recommend MIT or GPL for open science)  
**Contact:** (via GitHub issues)

---

_"Music is the hidden arithmetic of the soul, which does not know that it deals with numbers."_  
— Gottfried Wilhelm Leibniz

_"The brain is a musical instrument waiting to be heard."_  
— NeuroVis Project
