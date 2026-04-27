/*
 * NeuroVis EEG → SuperCollider OSC Test
 * 
 * SETUP:
 * 1. Boot SuperCollider server (Cmd+B or Server → Boot Server)
 * 2. Run this entire file (Cmd+A then Cmd+Enter)
 * 3. Start NeuroVis and enable OSC on port 7400
 * 4. Watch Post window for incoming EEG values
 * 5. Hear alpha power control a sine tone
 */

(
// ============================================================
// GLOBAL VARIABLES - Store latest EEG values
// ============================================================

~eegData = Dictionary.new;
~eegData[\ch1Alpha] = 0.0;
~eegData[\ch2Beta] = 0.0;
~eegData[\ch3Theta] = 0.0;
~eegData[\ch4Gamma] = 0.0;
~eegData[\alphaAvg] = 0.0;
~eegData[\betaAvg] = 0.0;
~eegData[\thetaAvg] = 0.0;

// ============================================================
// OSC RECEIVERS - Listen on port 7400
// ============================================================

// CH1 Alpha absolute power
OSCdef(\ch1Alpha, { |msg|
    var value = msg[1];
    ~eegData[\ch1Alpha] = value;
    ("CH1 Alpha: " ++ value.asString).postln;
}, '/eeg/CH1/alpha/absolute');

// CH2 Beta absolute power
OSCdef(\ch2Beta, { |msg|
    var value = msg[1];
    ~eegData[\ch2Beta] = value;
    ("CH2 Beta: " ++ value.asString).postln;
}, '/eeg/CH2/beta/absolute');

// CH3 Theta absolute power
OSCdef(\ch3Theta, { |msg|
    var value = msg[1];
    ~eegData[\ch3Theta] = value;
    ("CH3 Theta: " ++ value.asString).postln;
}, '/eeg/CH3/theta/absolute');

// CH4 Gamma absolute power
OSCdef(\ch4Gamma, { |msg|
    var value = msg[1];
    ~eegData[\ch4Gamma] = value;
    ("CH4 Gamma: " ++ value.asString).postln;
}, '/eeg/CH4/gamma/absolute');

// Alpha average across all channels
OSCdef(\alphaAvg, { |msg|
    var value = msg[1];
    ~eegData[\alphaAvg] = value;
    ("Alpha Average: " ++ value.asString).postln;
}, '/eeg/alpha/averages');

// Beta average
OSCdef(\betaAvg, { |msg|
    var value = msg[1];
    ~eegData[\betaAvg] = value;
    ("Beta Average: " ++ value.asString).postln;
}, '/eeg/beta/averages');

// Theta average
OSCdef(\thetaAvg, { |msg|
    var value = msg[1];
    ~eegData[\thetaAvg] = value;
    ("Theta Average: " ++ value.asString).postln;
}, '/eeg/theta/averages');

// Set the OSC receive port
thisProcess.openUDPPort(7400);
"OSC receiver ready on port 7400".postln;

// ============================================================
// SYNTH DEFINITIONS
// ============================================================

// Synth 1: Alpha-controlled sine tone
SynthDef(\alphaTone, {
    arg freq = 440, amp = 0.2, gate = 1;
    var sig, env;
    env = EnvGen.kr(Env.asr(0.1, 1, 0.5), gate, doneAction: 2);
    sig = SinOsc.ar(freq) * amp * env;
    Out.ar(0, sig ! 2);  // Stereo output
}).add;

// Synth 2: Multi-band additive synthesis
SynthDef(\multiBand, {
    arg delta = 0, theta = 0, alpha = 0, beta = 0, gamma = 0;
    var sig, base = 110;
    sig = SinOsc.ar(base * 1, 0, delta * 0.15) +
          SinOsc.ar(base * 2, 0, theta * 0.15) +
          SinOsc.ar(base * 3, 0, alpha * 0.15) +
          SinOsc.ar(base * 4, 0, beta * 0.15) +
          SinOsc.ar(base * 5, 0, gamma * 0.15);
    sig = FreeVerb.ar(sig, 0.5, 0.8, 0.5);
    Out.ar(0, sig ! 2);
}).add;

// Synth 3: FM synthesis with beta modulation
SynthDef(\betaFM, {
    arg carrier = 440, modFreq = 5, modDepth = 100, amp = 0.2;
    var mod, sig;
    mod = SinOsc.ar(modFreq, 0, modDepth);
    sig = SinOsc.ar(carrier + mod) * amp;
    Out.ar(0, sig ! 2);
}).add;

"SynthDefs loaded".postln;

// ============================================================
// OPTION 1: Alpha-Controlled Tone
// ============================================================

// Start an alpha-controlled tone
~alphaSynth = Synth(\alphaTone);

// Update frequency based on incoming alpha values (200-800 Hz)
~alphaTask = Task({
    inf.do({
        var alphaVal = ~eegData[\ch1Alpha] ? 0.0;
        var freq = alphaVal.linlin(0.0, 1.0, 200, 800);
        ~alphaSynth.set(\freq, freq, \amp, alphaVal * 0.3);
        0.05.wait;  // Update 20 times per second
    });
}).play;

"Alpha tone synth started (CH1 alpha controls frequency)".postln;

// ============================================================
// OPTION 2: Multi-Band Additive (COMMENTED OUT)
// Uncomment to use this instead of alpha tone
// ============================================================

/*
~multiBandSynth = Synth(\multiBand);

~multiBandTask = Task({
    inf.do({
        ~multiBandSynth.set(
            \delta, ~eegData[\deltaAvg] ? 0.0,
            \theta, ~eegData[\thetaAvg] ? 0.0,
            \alpha, ~eegData[\alphaAvg] ? 0.0,
            \beta, ~eegData[\betaAvg] ? 0.0,
            \gamma, ~eegData[\gammaAvg] ? 0.0
        );
        0.05.wait;
    });
}).play;

"Multi-band additive synth started".postln;
*/

// ============================================================
// OPTION 3: Beta FM Modulation (COMMENTED OUT)
// ============================================================

/*
~betaSynth = Synth(\betaFM);

~betaTask = Task({
    inf.do({
        var betaVal = ~eegData[\ch2Beta] ? 0.0;
        var modFreq = betaVal.linlin(0.0, 1.0, 2, 12);
        var modDepth = betaVal * 100;
        ~betaSynth.set(\modFreq, modFreq, \modDepth, modDepth);
        0.05.wait;
    });
}).play;

"Beta FM synth started (CH2 beta controls modulation)".postln;
*/

// ============================================================
// CLEANUP FUNCTION
// ============================================================

~cleanup = {
    ~alphaTask.stop;
    ~alphaSynth.free;
    // Uncomment if using other options:
    // ~multiBandTask.stop;
    // ~multiBandSynth.free;
    // ~betaTask.stop;
    // ~betaSynth.free;
    OSCdef.freeAll;
    "Stopped all OSC receivers and synths".postln;
};

"Ready! Start NeuroVis OSC to hear EEG-controlled sound.".postln;
"Run ~cleanup.value to stop everything.".postln;

)

// To stop everything, evaluate this line:
// ~cleanup.value;
