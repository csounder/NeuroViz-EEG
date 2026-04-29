# Dual-source sonification: making two brains audible

**Problem:** When two people (e.g. “Amy” and “Dr. B”) each drive a Muse (or two streams), the **ultimate challenge** is perceptual: listeners—including the audience—must be able to tell **which sonic layer belongs to whom** without reading a screen.

NeuroVis already routes bands to Csound (Teaching / V12) and Concert visuals. This note lists **compositional and engineering strategies** that scale from “we can hear the difference” to “the hall can hear the difference.”

## 1. Spatial separation (strongest for audiences)

- **Stereo / multichannel:** Hard-assign **Person A → left hemisphere of the mix** (or left half of the PA) and **Person B → right**, or **A = front L/R**, **B = surround rear**.
- **Width:** Narrow vs wide stereo field per person so sum does not collapse to mono mud.
- **Csound:** Separate busses, `pan` / `space` macros, or discrete speaker feeds for installations.

## 2. Register and role (orchestration, not duplication)

- **Amy:** Mid–high carrier; **Dr. B:** Bass / sub–bass driver, or vice versa—**swap roles by piece**, not by random overlap.
- **Harmony:** Force **different chord tones** (3rd vs 5th vs 7th) per stream so combined harmony is intentional, not two roots fighting.

## 3. Timbre / instrument identity

- **Fixed palette per person:** e.g. A = bowed or vocal-like, B = plucked / percussive. The brain separates sources by **spectral envelope** even when pitch overlaps.
- **V12 presets:** Map each ingress to a **different Csound instrument definition** (not only different gain on the same patch).

## 4. Temporal roles

- **Metric contrast:** One stream **locks grid** (quantized triggers); the other **floats** (rubato LFO on rate). Audience hears “pulse vs drift.”
- **Call and response:** Gate B so it only speaks when A’s band feature crosses a threshold (and vice versa)—reduces masking.

## 5. Spectral carving

- **EQ / complementary filtering:** A owns 200–800 Hz; B owns 2–6 kHz for a section, then swap—classic arrangement trick driven by EEG features.

## 6. Dynamics and voicing

- **Sidechain compression:** Duck B gently when A’s “salience” metric is high (or RMS), so foreground flips intentionally.

## 7. Labeling for the room

- **Brief program note:** “Left ear = Amy · Right ear = Dr. B” (or lighting cues L/R).
- **Visuals:** Concert mode can reinforce **color / side** (existing `ConcertVisualizer` lanes can map per future `sourceId`).

## 8. Data plumbing (implementation direction)

- **Two WebSocket clients or multiplexed streams** with `participantId` / `source` on each message.
- **Duplicate OSC namespaces:** `/muse/a/...` vs `/muse/b/...` or port-per-person in Csound.
- **Store:** `latestBandsRel` becomes per-source or a map; Teaching and Concert components subscribe by id.

## 9. What not to rely on

- **Raw “more alpha = louder”** for both—masking will hide the distinction.
- **Identical patches + pan only** in mono PA—you need **timbre or register** difference too.

## 10. Sharing performance presets (e.g. Amy’s MacBook, your MacBook)

Until in-app dual-stream mixing exists, **each person runs their own copy of NeuroVis** (same git checkout or same release build is best). You **align the mapping** by sharing one file:

**Format:** `neurovis-performance-preset` (version 1), produced on **Concert** under **Share performance preset**.

1. On **Concert**, tune scene, intensity, trails, HUD/controls visibility, and the **V12** mapping (harmony / drivers / orchestration).
2. Under **Share performance preset**, choose **Download JSON** (optionally include the Research **band-edge** preset so Welch/FFT band limits match Mind Monitor or your research baseline).
3. Send the file (email, AirDrop, shared folder, etc.). On **Amy’s machine**, open **Concert** → **Import file…** and apply.

**What travels in the file:** concert visual parameters, lifted **V12** controls from the page, and optionally **band-edge** preset. **What does not:** internal-only UI inside `CsoundV12Renderer` that isn’t stored on the page, and of course each person’s live EEG—that stays local to each laptop.

**Tip:** Note the **NeuroVis commit or version** in the filename or chat so both of you parse the same preset schema.

---

## 11. Two performers today: projection + hardware audio mixer

You do **not** need a single NeuroVis instance to **hear two brains** in the room. A practical performance setup:

| Role | Machine | Audio | Visuals |
|------|---------|--------|---------|
| Performer A (e.g. Amy) | MacBook A | **Line / USB audio out** → one **stereo pair** on the mixer | Optional: **HDMI/Thunderbolt** to projector for her Concert page |
| Performer B (e.g. you) | MacBook B | **Line / USB audio out** → second **stereo pair** on the mixer | Your laptop can drive projection, or a **switcher** picks which screen is “house” |

**Mixer:** Treat each laptop as a **line-level stereo source**. Pan Amy **hard L**, you **hard R** (or the inverse), or use **subgroups** (Amy → Aux 1, you → Aux 2) then sum to FOH. Add **EQ / HPF** per channel so the combined mix isn’t muddy. **Headphone cue** each channel during soundcheck.

**Projection:** One projector can show **one** HDMI input at a time—use an **A/B switch** or a **small video mixer** if you need both desktops visible; otherwise dedicate one machine as **“visual master”** and mirror or extend that display to the projector.

**Presets (§10)** keep **sonification and stage look** aligned while **audio summing** stays in the analog/digital mixer where the house engineer expects it.

---

## 12. Dual-player software design (future implementation)

This section records **how NeuroVis could evolve** so **one** dashboard (or one server) cleanly carries **two logical players** without fighting buffers—complementing §§1–9 (perception) and §11 (hardware mix today).

### 12.1 Problem statement

Today, **Mind Monitor OSC** (UDP **5000**) and the **BLE bridge** both feed **shared server state** (e.g. one `eegBuffer`, one `currentBandPowers`). If two people stream simultaneously into **one** Node process, updates **interleave** and **last writer wins** on shared fields. WebSocket **`eeg`** payloads also don’t carry a stable **participant id** for the UI to fork on.

### 12.2 Target behavior

- **Two participants** (e.g. `p1`, `p2`), each with: latest EEG sample, band powers, motion, optional Mind Monitor OSC mirror, device label.
- **Explicit routing:** Concert / V12 / Teaching subscribe to **`participantId`** (or `default` when only one source exists).
- **Optional:** Amy stays on **Mind Monitor → your server** while you stay on **direct Muse**; both appear as **named slots**, not one polluted stream.

### 12.3 Server (`server-enhanced.js`)

1. **Ingress tagging:** Every path that calls `broadcastEEGData` / `broadcastBandPowers` / motion passes **`participantId`** (and **`source`**: `device` | `mind_monitor` | `simulator`).
2. **Separate buffers** (or ring buffers) **per participant** for EEG and band-power aggregation—no shared `eegBuffer` across ids without a defined merge policy.
3. **WebSocket contract:** Either  
   - **Multiplexed messages:** `{ type: "eeg", participantId, ... }`, same for `bands`, `motion`, or  
   - **Parallel topics** / namespaced types (heavier for clients).
4. **OSC output:** Configurable **prefix or port per participant** (e.g. `/muse/a/...` vs `/muse/b/...`, or duplicate Csound instances on two UDP ports).
5. **Mind Monitor:** Keep listening on **5000**; map **incoming IP or a config key** to `participantId` if two phones ever point at one server (advanced); default single remote → `p_remote`, local bridge → `p_local`.

### 12.4 Client store (`web/lib/store.ts`)

- Replace flat `latestEEG` (conceptually) with **`byParticipant: Record<string, ParticipantSlice>`** or a fixed tuple `{ a, b }` for v1.
- **Selectors** for charts: `useParticipant("amy")` etc.; default route uses `participants[0]` for backward compatibility.
- **UI:** Participant switcher on Concert / OSC page; recorder manifest lists **which id** was recorded.

### 12.5 Csound / browser audio

- **Single process:** Two instrument chains, each fed from a different OSC namespace or control bus.  
- **Two tabs / two Csound runs:** Already approximated by **two laptops** (§11); software dual-player mainly helps **one machine + one projector UI** or **single Csound score with two brains**.

### 12.6 Phased rollout (suggested)

| Phase | Scope |
|-------|--------|
| **A** | WebSocket + store: optional `participantId` on messages; **ignore** unknown ids until UI exists; **no** buffer split yet (spec only). |
| **B** | Server: duplicate buffers per id; **one** remote Mind Monitor + **one** local BLE without cross-contamination. |
| **C** | Concert / V12: bind visual + audio mapping to **selected** participant; second participant **picture-in-picture** or split layout. |
| **D** | OSC / Csound templates documented for **two namespaces**; optional stereo pan law per §1. |

### 12.7 Testing

- Two **simulators** or **recorded loops** tagged as `p1` / `p2`.  
- Regression: **single participant** mode unchanged when only one id is active.

---

This is a **product and composition** roadmap: the EEG math can be the same per person; **arrangement** (and, in software, **namespaced plumbing**) is what makes two brains **two characters** in the piece.
