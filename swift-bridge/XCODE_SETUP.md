# Xcode Setup Guide - Muse Bridge

Complete instructions for building the Swift bridge with Xcode.

## Prerequisites

- Xcode 13+ (with Swift 5.5+)
- M1/M2 MacBook Pro
- Muse SDK 8.0.5 extracted to `/tmp/libmuse_macos_8.0.5/`

## Step 1: Create Xcode Project

### Command Line

```bash
cd ~/Desktop
mkdir MuseBridgeApp && cd MuseBridgeApp
```

### In Xcode

1. **File** → **New** → **Project**
2. Select **macOS** → **Command Line Tool**
3. Fill in:
   - Product Name: `MuseBridge`
   - Organization: `Your Name` (or leave blank)
   - Language: **Swift**
   - Storage: Choose Desktop/MuseBridgeApp
4. Click **Create**

## Step 2: Add Muse Framework

### Link Framework

1. Select **Project** (left sidebar)
2. Select **MuseBridge** (target)
3. **Build Phases** tab → **Link Binary With Libraries** section
4. Click **+** button
5. Click **Add Other...**
6. Navigate to: `/tmp/libmuse_macos_8.0.5/Muse.framework`
7. Click **Open** → **Add**

### Add Framework Search Path

1. Still in **Build Settings** tab
2. Search for: `Framework Search Paths`
3. Double-click the value field
4. Click **+** and add: `/tmp/libmuse_macos_8.0.5`

### Add Header Search Path

1. Search for: `Header Search Paths`
2. Double-click the value field
3. Click **+** and add: `/tmp/libmuse_macos_8.0.5/Muse.framework/Headers`

### Enable Bridging Header

1. Search for: `Bridging Header`
2. Set value to: `MuseBridge/Bridging-Header.h` (if you have a Bridging-Header.h file)

## Step 3: Copy Source Files

Replace the default `main.swift` with the provided `main.swift`:

```bash
cp /Users/richardboulanger/dB-Studio/Dr.C/opencode/packages/muse-eeg-server/swift-bridge/main.swift ~/Desktop/MuseBridgeApp/MuseBridge/main.swift
```

Optionally, copy the bridging header:

```bash
cp /Users/richardboulanger/dB-Studio/Dr.C/opencode/packages/muse-eeg-server/swift-bridge/Bridging-Header.h ~/Desktop/MuseBridgeApp/MuseBridge/Bridging-Header.h
```

## Step 4: Build

### In Xcode

```
⌘B  (Product → Build)
```

Or from command line:

```bash
cd ~/Desktop/MuseBridgeApp
xcodebuild -scheme MuseBridge -configuration Debug
```

### Expected Output

```
Build complete! (X.XXs)
```

## Step 5: Locate Executable

The compiled binary is at:

```
~/Desktop/MuseBridgeApp/DerivedData/MuseBridge/Build/Products/Debug/MuseBridge
```

Or find it with:

```bash
find ~/Desktop/MuseBridgeApp -name "MuseBridge" -type f -executable
```

## Step 6: Deploy to Backend

Copy to server directory:

```bash
cp ~/Desktop/MuseBridgeApp/DerivedData/MuseBridge/Build/Products/Debug/MuseBridge \
   /Users/richardboulanger/dB-Studio/Dr.C/opencode/packages/muse-eeg-server/MuseBridge

chmod +x /Users/richardboulanger/dB-Studio/Dr.C/opencode/packages/muse-eeg-server/MuseBridge
```

## Step 7: Test

From the server directory:

```bash
cd /Users/richardboulanger/dB-Studio/Dr.C/opencode/packages/muse-eeg-server
npm start
```

You should see:

```
✓ Web UI: http://localhost:3000
✓ OSC client ready → 127.0.0.1:7400

🚀 Launching Swift bridge: ./MuseBridge
[SWIFT] 🧠 Muse EEG Bridge v1.0 Starting...
```

## Troubleshooting

### "Muse/Muse.h file not found"

- Verify Muse.framework is in `/tmp/libmuse_macos_8.0.5/`
- Check **Build Settings** → **Framework Search Paths** includes `/tmp/libmuse_macos_8.0.5`
- Check **Header Search Paths** includes `/tmp/libmuse_macos_8.0.5/Muse.framework/Headers`
- **Clean Build Folder** (⇧⌘K) and rebuild

### "IXNMuseListener not found"

- Ensure bridging header is set correctly
- Try adding bridging header path to **Objective-C Bridging Header** setting

### Framework not linked

- Verify **Link Binary With Libraries** includes `Muse.framework`
- Check it's the correct M1/M2 binary (not Intel)

### Build succeeds but executable doesn't run

```bash
# Check dependencies
otool -L ~/Desktop/MuseBridgeApp/DerivedData/MuseBridge/Build/Products/Debug/MuseBridge
```

Should show:

```
/tmp/libmuse_macos_8.0.5/Muse.framework/Muse (compatibility version...)
```

## Xcode Project Settings Summary

| Setting                | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Framework Search Paths | `/tmp/libmuse_macos_8.0.5`                        |
| Header Search Paths    | `/tmp/libmuse_macos_8.0.5/Muse.framework/Headers` |
| Linked Frameworks      | `Muse.framework`                                  |
| Bridging Header        | `MuseBridge/Bridging-Header.h`                    |
| Minimum macOS          | 10.13+ (or whatever Muse.framework requires)      |
| Architecture           | Apple Silicon (M1/M2) or Universal                |

## Next Steps

Once built, the executable will automatically:

1. Discover nearby Muse 2 and Muse S Athena devices
2. Accept connection commands from Node.js backend via stdin
3. Stream EEG data as JSON to stdout
4. Integrate with the web dashboard at http://localhost:3000

Good luck! 🧠
