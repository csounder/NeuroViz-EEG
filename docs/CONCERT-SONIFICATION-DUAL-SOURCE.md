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

---

This is a **product and composition** roadmap: the EEG math can be the same per person; **arrangement** is what makes two brains **two characters** in the piece.
