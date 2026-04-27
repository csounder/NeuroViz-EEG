/*
 * NeuroVis EEG → Unity OSC Test
 * 
 * SETUP:
 * 1. Install extOSC from Unity Asset Store (free): https://assetstore.unity.com/packages/tools/input-management/extosc-open-sound-control-94169
 * 2. Create a new GameObject in your scene and attach this script
 * 3. In the Inspector, set OSC Receiver component to port 7400
 * 4. Press Play in Unity
 * 5. Start NeuroVis and enable OSC on port 7400
 * 6. Watch Console for incoming EEG values
 * 7. See cube transform controlled by EEG data
 */

using UnityEngine;
using extOSC;

public class NeuroVisOSCReceiver : MonoBehaviour
{
    // ============================================================
    // OSC RECEIVER
    // ============================================================
    
    [Header("OSC Settings")]
    [Tooltip("OSC Receiver component (add to same GameObject)")]
    public OSCReceiver oscReceiver;
    
    [Tooltip("Port to listen on (default: 7400)")]
    public int oscPort = 7400;
    
    // ============================================================
    // EEG DATA STORAGE
    // ============================================================
    
    [Header("EEG Data (Live)")]
    [Tooltip("CH1 Alpha absolute power")]
    public float ch1Alpha = 0f;
    
    [Tooltip("CH2 Beta absolute power")]
    public float ch2Beta = 0f;
    
    [Tooltip("CH3 Theta absolute power")]
    public float ch3Theta = 0f;
    
    [Tooltip("CH4 Gamma absolute power")]
    public float ch4Gamma = 0f;
    
    [Tooltip("Alpha average across all channels")]
    public float alphaAvg = 0f;
    
    [Tooltip("Beta average")]
    public float betaAvg = 0f;
    
    [Tooltip("Theta average")]
    public float thetaAvg = 0f;
    
    [Tooltip("Delta average")]
    public float deltaAvg = 0f;
    
    [Tooltip("Gamma average")]
    public float gammaAvg = 0f;
    
    // ============================================================
    // VISUAL DEMO
    // ============================================================
    
    [Header("Visual Demo")]
    [Tooltip("Cube to control (leave empty to auto-create)")]
    public GameObject targetCube;
    
    [Tooltip("Enable debug logging")]
    public bool debugLogging = true;
    
    private Vector3 initialCubePosition;
    private Vector3 initialCubeScale;
    
    // ============================================================
    // UNITY LIFECYCLE
    // ============================================================
    
    void Start()
    {
        // Create OSC Receiver if not assigned
        if (oscReceiver == null)
        {
            oscReceiver = gameObject.AddComponent<OSCReceiver>();
            oscReceiver.LocalPort = oscPort;
        }
        
        // Create demo cube if not assigned
        if (targetCube == null)
        {
            targetCube = GameObject.CreatePrimitive(PrimitiveType.Cube);
            targetCube.name = "EEG-Controlled Cube";
            targetCube.transform.position = new Vector3(0, 0, 5);
            
            // Add a material for better visibility
            var renderer = targetCube.GetComponent<Renderer>();
            renderer.material = new Material(Shader.Find("Standard"));
            renderer.material.color = Color.cyan;
        }
        
        initialCubePosition = targetCube.transform.position;
        initialCubeScale = targetCube.transform.localScale;
        
        // Bind OSC message handlers
        BindOSCHandlers();
        
        Debug.Log("NeuroVis OSC Receiver started on port " + oscPort);
        Debug.Log("Waiting for OSC messages from NeuroVis...");
    }
    
    void Update()
    {
        // Update cube based on EEG data
        UpdateVisualization();
    }
    
    void OnDestroy()
    {
        // Unbind OSC handlers
        if (oscReceiver != null)
        {
            oscReceiver.UnbindAll();
        }
    }
    
    // ============================================================
    // OSC MESSAGE HANDLERS
    // ============================================================
    
    void BindOSCHandlers()
    {
        // Bind absolute power for each channel
        oscReceiver.Bind("/eeg/CH1/alpha/absolute", OnCH1Alpha);
        oscReceiver.Bind("/eeg/CH2/beta/absolute", OnCH2Beta);
        oscReceiver.Bind("/eeg/CH3/theta/absolute", OnCH3Theta);
        oscReceiver.Bind("/eeg/CH4/gamma/absolute", OnCH4Gamma);
        
        // Bind averages
        oscReceiver.Bind("/eeg/alpha/averages", OnAlphaAvg);
        oscReceiver.Bind("/eeg/beta/averages", OnBetaAvg);
        oscReceiver.Bind("/eeg/theta/averages", OnThetaAvg);
        oscReceiver.Bind("/eeg/delta/averages", OnDeltaAvg);
        oscReceiver.Bind("/eeg/gamma/averages", OnGammaAvg);
        
        Debug.Log("OSC message handlers bound successfully");
    }
    
    void OnCH1Alpha(OSCMessage message)
    {
        ch1Alpha = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"CH1 Alpha: {ch1Alpha:F3}");
    }
    
    void OnCH2Beta(OSCMessage message)
    {
        ch2Beta = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"CH2 Beta: {ch2Beta:F3}");
    }
    
    void OnCH3Theta(OSCMessage message)
    {
        ch3Theta = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"CH3 Theta: {ch3Theta:F3}");
    }
    
    void OnCH4Gamma(OSCMessage message)
    {
        ch4Gamma = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"CH4 Gamma: {ch4Gamma:F3}");
    }
    
    void OnAlphaAvg(OSCMessage message)
    {
        alphaAvg = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"Alpha Average: {alphaAvg:F3}");
    }
    
    void OnBetaAvg(OSCMessage message)
    {
        betaAvg = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"Beta Average: {betaAvg:F3}");
    }
    
    void OnThetaAvg(OSCMessage message)
    {
        thetaAvg = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"Theta Average: {thetaAvg:F3}");
    }
    
    void OnDeltaAvg(OSCMessage message)
    {
        deltaAvg = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"Delta Average: {deltaAvg:F3}");
    }
    
    void OnGammaAvg(OSCMessage message)
    {
        gammaAvg = message.Values[0].FloatValue;
        if (debugLogging) Debug.Log($"Gamma Average: {gammaAvg:F3}");
    }
    
    // ============================================================
    // VISUALIZATION
    // ============================================================
    
    void UpdateVisualization()
    {
        if (targetCube == null) return;
        
        // Y position controlled by alpha (relaxation/focus)
        float yPos = initialCubePosition.y + (alphaAvg * 3f);
        
        // X rotation controlled by beta (active thinking)
        float xRot = betaAvg * 180f;
        
        // Scale controlled by theta (meditation/deep state)
        float scale = 1f + (thetaAvg * 2f);
        
        // Color controlled by gamma (high-frequency activity)
        Color cubeColor = Color.Lerp(Color.cyan, Color.magenta, gammaAvg);
        
        // Apply transformations with smoothing
        targetCube.transform.position = Vector3.Lerp(
            targetCube.transform.position,
            new Vector3(initialCubePosition.x, yPos, initialCubePosition.z),
            Time.deltaTime * 2f
        );
        
        targetCube.transform.rotation = Quaternion.Slerp(
            targetCube.transform.rotation,
            Quaternion.Euler(xRot, Time.time * 20f, 0),
            Time.deltaTime * 2f
        );
        
        targetCube.transform.localScale = Vector3.Lerp(
            targetCube.transform.localScale,
            initialCubeScale * scale,
            Time.deltaTime * 2f
        );
        
        var renderer = targetCube.GetComponent<Renderer>();
        if (renderer != null)
        {
            renderer.material.color = Color.Lerp(
                renderer.material.color,
                cubeColor,
                Time.deltaTime * 2f
            );
        }
    }
}
