#!/usr/bin/env node
/**
 * Quick Ganglion Connection Test via BrainFlow
 * Tests both BLED dongle and Native Bluetooth
 */

const brainflow = require("brainflow");

// BrainFlow constants
const BoardIds = brainflow.BoardIds;
const BrainFlowInputParams = brainflow.BrainFlowInputParams;
const BoardShim = brainflow.BoardShim;
const LogLevels = brainflow.LogLevels;

async function testGanglion() {
  console.log("🧪 Testing OpenBCI Ganglion connection...\n");

  // Enable BrainFlow logging
  BoardShim.setLogLevel(LogLevels.LEVEL_INFO);

  // Test with BLED dongle first (Richard has it plugged in)
  const boardId = BoardIds.GANGLION_BOARD; // 1 = BLED dongle
  // To test native BT instead: BoardIds.GANGLION_NATIVE_BOARD (46)

  const params = new BrainFlowInputParams();

  // BLED dongle serial port (found via ls /dev/cu.*)
  params.serial_port = "/dev/cu.usbmodem11";

  console.log(`📡 Board ID: ${boardId} (GANGLION_BOARD with BLED dongle)`);
  console.log("🔍 Searching for Ganglion...\n");

  let board;

  try {
    // Create board session
    board = new BoardShim(boardId, params);

    // Prepare session (connects to hardware)
    console.log("⏳ Preparing session (connecting to hardware)...");
    board.prepareSession();
    console.log("✅ Session prepared - Ganglion connected!\n");

    // Get board info
    const eegChannels = BoardShim.getEegChannels(boardId);
    const samplingRate = BoardShim.getSamplingRate(boardId);
    const timestamp = BoardShim.getTimestampChannel(boardId);

    console.log(`📊 Ganglion Specs:`);
    console.log(
      `   EEG Channels: ${eegChannels.length} (indices: ${eegChannels.join(", ")})`,
    );
    console.log(`   Sampling Rate: ${samplingRate} Hz`);
    console.log(`   Timestamp Channel: ${timestamp}\n`);

    // Start streaming
    console.log("▶️  Starting EEG stream...");
    board.startStream();
    console.log("✅ Streaming started!\n");

    // Collect data for 5 seconds
    console.log("📥 Collecting 5 seconds of data...");

    let packetCount = 0;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const data = board.getBoardData(); // Get all available data

      if (data && data.length > 0 && data[0].length > 0) {
        const numSamples = data[0].length;
        packetCount += numSamples;

        // Get latest EEG sample
        const latestSample = data.map((row) => row[row.length - 1]);
        const eegValues = eegChannels.map((ch) => latestSample[ch].toFixed(6));

        console.log(`📦 Packet #${packetCount}: [${eegValues.join(", ")}] µV`);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= 5) {
        clearInterval(interval);
        cleanup();
      }
    }, 100); // Check every 100ms

    function cleanup() {
      console.log("\n🛑 Stopping stream...");
      board.stopStream();
      console.log("✅ Stream stopped");

      console.log("🔌 Releasing session...");
      board.releaseSession();
      console.log("✅ Session released\n");

      console.log(`📊 Total packets received: ${packetCount}`);
      console.log(
        `📈 Effective rate: ${(packetCount / 5).toFixed(1)} samples/sec`,
      );
      console.log(`📡 Expected rate: ${samplingRate} Hz`);

      if (packetCount > 0) {
        console.log("\n✅ SUCCESS! Ganglion is streaming EEG data!");
      } else {
        console.log("\n❌ FAILED - No data received");
      }

      process.exit(0);
    }
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Is Ganglion powered on?");
    console.error("2. Is BLED dongle plugged in?");
    console.error("3. Is OpenBCI GUI closed? (can't share connection)");
    console.error("4. Try: ls /dev/cu.usbserial-* (check serial port)");

    if (board) {
      try {
        board.releaseSession();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Run test
testGanglion();
