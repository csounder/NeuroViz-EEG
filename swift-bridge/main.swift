import Foundation

/**
 Muse EEG Bridge for macOS - LibMuse 8.0.5
 Connects to Muse 2/S headsets and outputs JSON to stdout
 */

// MARK: - JSON Logging Helper
func logJSON(_ object: [String: Any]) {
    do {
        let data = try JSONSerialization.data(withJSONObject: object)
        if let jsonString = String(data: data, encoding: .utf8) {
            print(jsonString)
            fflush(stdout)
        }
    } catch {
        logError("JSON serialization failed: \(error)")
    }
}

func logError(_ message: String) {
    logJSON(["type": "error", "message": message])
}

func logInfo(_ message: String) {
    logJSON(["type": "status", "message": message])
}

// MARK: - Muse Manager
class MuseManager: NSObject, IXNMuseListener, IXNMuseDataListener {
    static let shared = MuseManager()
    
    var muses: [IXNMuse] = []
    var activeMuse: IXNMuse?
    var isConnected = false
    var museManager: IXNMuseManager?
    var keepaliveTimer: Timer?
    
    override init() {
        super.init()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.startDiscovery()
        }
    }
    
    // MARK: - Discovery & Connection
    func startDiscovery() {
        guard let manager = IXNMuseManager.shared() else {
            logError("Failed to get IXNMuseManager")
            return
        }
        
        self.museManager = manager
        manager.setMuseListener(self)
        manager.startListening()
        logInfo("🔍 Discovery started - scanning for Muse devices")
    }
    
    func stopDiscovery() {
        museManager?.stopListening()
        logInfo("Discovery stopped")
    }
    
    func connectToDevice(at index: Int) {
        guard index >= 0 && index < muses.count else {
            logError("Device index \(index) out of range")
            return
        }
        
        let muse = muses[index]
        activeMuse = muse
        
        // Register for all data types
        muse.registerDataListener(self, type: IXNMuseDataPacketType.eeg)
        muse.registerDataListener(self, type: IXNMuseDataPacketType.bandPowers)
        muse.registerDataListener(self, type: IXNMuseDataPacketType.accelerometer)
        muse.registerDataListener(self, type: IXNMuseDataPacketType.gyroscope)
        muse.registerDataListener(self, type: IXNMuseDataPacketType.ppg)
        muse.registerDataListener(self, type: IXNMuseDataPacketType.battery)
        
        logInfo("🔗 Connecting to \(muse.getName())...")
        
        // Run async to establish connection
        muse.runAsynchronously()
        isConnected = true
        
        // Start keepalive to prevent timeout
        startKeepalive()
    }
    
    func startKeepalive() {
        // Stop any existing keepalive timer
        stopKeepalive()
        
        // Send keepalive every 5 seconds to prevent timeout
        keepaliveTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            guard let self = self, let muse = self.activeMuse else { return }
            
            // Request device status to keep connection alive
            // This prevents the ~30 second timeout
            muse.sendCommand("s")  // Status command
        }
    }
    
    func stopKeepalive() {
        keepaliveTimer?.invalidate()
        keepaliveTimer = nil
    }
    
    func disconnectFromDevice() {
        guard let muse = activeMuse else { return }
        
        // Stop keepalive timer
        stopKeepalive()
        
        muse.disconnect()
        activeMuse = nil
        isConnected = false
        
        logInfo("🔌 Disconnected from \(muse.getName())")
    }
    
    // MARK: - IXNMuseListener
    func museListChanged() {
        guard let manager = museManager else { return }
        
        muses = manager.getMuses() as? [IXNMuse] ?? []
        
        let devices = muses.enumerated().map { idx, muse -> [String: Any] in
            let connState = muse.connectionState()
            let isConnected = connState == IXNConnectionState.connected
            
            return [
                "index": idx,
                "name": muse.getName(),
                "model": muse.getModel().rawValue,
                "connected": isConnected
            ]
        }
        
        logJSON([
            "type": "device_list",
            "count": devices.count,
            "devices": devices
        ])
        
        if devices.isEmpty {
            logInfo("⏳ No Muse devices found - make sure Bluetooth is on and device is in pairing mode")
        }
    }
    
    // MARK: - IXNMuseDataListener
    func receiveMuseDataPacket(_ packet: IXNMuseDataPacket?, muse: IXNMuse?) {
        guard let packet = packet else { return }
        guard let muse = muse else { return }
        
         switch packet.packetType() {
         case IXNMuseDataPacketType.eeg:
             handleEEGData(packet, muse)
         case IXNMuseDataPacketType.bandPowers:
             handleBandPowers(packet, muse)
         case IXNMuseDataPacketType.accelerometer:
             handleAccelerometer(packet, muse)
         case IXNMuseDataPacketType.gyroscope:
             handleGyroscope(packet, muse)
         case IXNMuseDataPacketType.ppg:
             handlePPG(packet, muse)
         case IXNMuseDataPacketType.battery:
             handleBattery(packet, muse)
         default:
             break
         }
    }
    
    // MARK: - EEG Data Handler (256 Hz)
    func handleEEGData(_ packet: IXNMuseDataPacket, _ muse: IXNMuse) {
        let eeg = [
            packet.getEegChannelValue(IXNEeg.EEG1),    // TP9 (Left Ear)
            packet.getEegChannelValue(IXNEeg.EEG2),    // AF7 (Left Forehead)
            packet.getEegChannelValue(IXNEeg.EEG3),    // AF8 (Right Forehead)
            packet.getEegChannelValue(IXNEeg.EEG4)     // TP10 (Right Ear)
        ]
        
        logJSON([
            "type": "eeg",
            "timestamp": packet.timestamp(),
            "eeg": eeg,
            "deviceName": muse.getName()
        ])
    }
    
    // MARK: - Band Powers Handler (10 Hz - Absolute Log Scale)
    func handleBandPowers(_ packet: IXNMuseDataPacket, _ muse: IXNMuse) {
        // Extract absolute band powers in LOG scale
        let deltaPower = packet.getEegChannelValue(IXNEeg.DELTA)     // 1-4 Hz
        let thetaPower = packet.getEegChannelValue(IXNEeg.THETA)     // 4-8 Hz
        let alphaPower = packet.getEegChannelValue(IXNEeg.ALPHA)     // 7.5-13 Hz
        let betaPower = packet.getEegChannelValue(IXNEeg.BETA)       // 13-30 Hz
        let gammaPower = packet.getEegChannelValue(IXNEeg.GAMMA)     // 30-44 Hz
        
        // Convert from log scale to linear scale
        let deltaLinear = pow(10.0, deltaPower)
        let thetaLinear = pow(10.0, thetaPower)
        let alphaLinear = pow(10.0, alphaPower)
        let betaLinear = pow(10.0, betaPower)
        let gammaLinear = pow(10.0, gammaPower)
        
        // Calculate sum for relative normalization
        let totalLinear = deltaLinear + thetaLinear + alphaLinear + betaLinear + gammaLinear
        
        // Calculate relative band powers (0-1 range)
        let deltaRelative = deltaLinear / totalLinear
        let thetaRelative = thetaLinear / totalLinear
        let alphaRelative = alphaLinear / totalLinear
        let betaRelative = betaLinear / totalLinear
        let gammaRelative = gammaLinear / totalLinear
        
        logJSON([
            "type": "bandPowers",
            "timestamp": packet.timestamp(),
            "absolute": [
                "delta": deltaPower,
                "theta": thetaPower,
                "alpha": alphaPower,
                "beta": betaPower,
                "gamma": gammaPower
            ],
            "relative": [
                "delta": deltaRelative,
                "theta": thetaRelative,
                "alpha": alphaRelative,
                "beta": betaRelative,
                "gamma": gammaRelative
            ],
            "deviceName": muse.getName()
        ])
    }
    
    // MARK: - Motion Handlers
    func handleAccelerometer(_ packet: IXNMuseDataPacket, _ muse: IXNMuse) {
        let accel = [
            packet.getAccelerometerValue(IXNEeg.ACCEL_X),
            packet.getAccelerometerValue(IXNEeg.ACCEL_Y),
            packet.getAccelerometerValue(IXNEeg.ACCEL_Z)
        ]
        
        logJSON([
            "type": "accelerometer",
            "timestamp": packet.timestamp(),
            "accel": accel,
            "deviceName": muse.getName()
        ])
    }
    
    func handleGyroscope(_ packet: IXNMuseDataPacket, _ muse: IXNMuse) {
        let gyro = [
            packet.getGyroValue(IXNEeg.GYRO_X),
            packet.getGyroValue(IXNEeg.GYRO_Y),
            packet.getGyroValue(IXNEeg.GYRO_Z)
        ]
        
        logJSON([
            "type": "gyroscope",
            "timestamp": packet.timestamp(),
            "gyro": gyro,
            "deviceName": muse.getName()
        ])
    }
    
    // MARK: - PPG/Heart Rate Handler (1 Hz)
    func handlePPG(_ packet: IXNMuseDataPacket, _ muse: IXNMuse) {
        // PPG has 3 channels (red, green, infrared) for heart rate detection
        let ppg1 = packet.getPpgChannelValue(IXNEeg.PPG1)  // Red LED
        let ppg2 = packet.getPpgChannelValue(IXNEeg.PPG2)  // Green LED
        let ppg3 = packet.getPpgChannelValue(IXNEeg.PPG3)  // Infrared LED
        
        logJSON([
            "type": "ppg",
            "timestamp": packet.timestamp(),
            "ppg": [ppg1, ppg2, ppg3],
            "deviceName": muse.getName()
        ])
    }
    
    func handleBattery(_ packet: IXNMuseDataPacket, _ muse: IXNMuse) {
        let batteryLevel = packet.getBatteryValue(IXNEeg.BATT_PERCENT)
        
        logJSON([
            "type": "battery",
            "timestamp": packet.timestamp(),
            "percentage": batteryLevel,
            "deviceName": muse.getName()
        ])
    }
    
    func receiveMuseArtifactPacket(_ packet: IXNMuseArtifactPacket, muse: IXNMuse?) {
        // Optional: Handle artifact packets (blink, jaw clench, etc.)
        // For now, we'll ignore these
    }
}

// MARK: - Main
logInfo("🧠 Muse EEG Bridge v1.0 Starting...")

// Initialize manager
let museManager = MuseManager.shared

logInfo("✓ Ready - listening for Muse devices")

// Keep alive
RunLoop.main.run()
