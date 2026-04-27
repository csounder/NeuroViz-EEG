/*
 * NeuroVis EEG → Unreal Engine OSC Test
 * 
 * SETUP:
 * 1. Install OSC Plugin for Unreal Engine:
 *    - In Epic Games Launcher, go to Marketplace → Search "OSC"
 *    - Install "OSC (Open Sound Control)" plugin (free)
 *    - Or use: https://docs.unrealengine.com/5.0/en-US/osc-open-sound-control-in-unreal-engine/
 * 
 * 2. Enable the plugin in your project:
 *    - Edit → Plugins → Search "OSC" → Enable → Restart Editor
 * 
 * 3. Create a new C++ Actor class and paste this code
 *    OR use Blueprint (see instructions at bottom of file)
 * 
 * 4. Place the actor in your level
 * 
 * 5. Start NeuroVis and enable OSC on port 7400
 * 
 * 6. See sphere transform controlled by EEG data
 */

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "OSCServer.h"
#include "OSCMessage.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "NeuroVisOSCReceiver.generated.h"

UCLASS()
class YOURPROJECT_API ANeuroVisOSCReceiver : public AActor
{
    GENERATED_BODY()
    
public:
    // ============================================================
    // CONSTRUCTOR
    // ============================================================
    
    ANeuroVisOSCReceiver()
    {
        PrimaryActorTick.bCanEverTick = true;
        
        // Create sphere mesh component
        SphereMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("SphereMesh"));
        RootComponent = SphereMesh;
        
        // Set default OSC port
        OSCPort = 7400;
    }
    
protected:
    // ============================================================
    // COMPONENTS
    // ============================================================
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG")
    UStaticMeshComponent* SphereMesh;
    
    UPROPERTY()
    UMaterialInstanceDynamic* DynamicMaterial;
    
    // ============================================================
    // OSC SETTINGS
    // ============================================================
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "OSC")
    int32 OSCPort;
    
    UPROPERTY()
    UOSCServer* OSCServer;
    
    // ============================================================
    // EEG DATA
    // ============================================================
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float CH1_Alpha = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float CH2_Beta = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float CH3_Theta = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float CH4_Gamma = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float Alpha_Avg = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float Beta_Avg = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float Theta_Avg = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float Delta_Avg = 0.0f;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "EEG Data")
    float Gamma_Avg = 0.0f;
    
    // ============================================================
    // VISUALIZATION SETTINGS
    // ============================================================
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    float PositionMultiplier = 500.0f;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    float ScaleMultiplier = 3.0f;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Visualization")
    bool bDebugLogging = true;
    
    // ============================================================
    // LIFECYCLE FUNCTIONS
    // ============================================================
    
    virtual void BeginPlay() override
    {
        Super::BeginPlay();
        
        // Create OSC Server
        OSCServer = NewObject<UOSCServer>();
        
        if (OSCServer)
        {
            // Listen on specified port
            OSCServer->SetReceiveIPAddress(FString("0.0.0.0"), OSCPort);
            OSCServer->Listen();
            
            // Bind OSC message handlers
            BindOSCHandlers();
            
            UE_LOG(LogTemp, Log, TEXT("NeuroVis OSC Receiver started on port %d"), OSCPort);
        }
        
        // Create dynamic material for color control
        if (SphereMesh && SphereMesh->GetMaterial(0))
        {
            DynamicMaterial = UMaterialInstanceDynamic::Create(SphereMesh->GetMaterial(0), this);
            SphereMesh->SetMaterial(0, DynamicMaterial);
        }
    }
    
    virtual void Tick(float DeltaTime) override
    {
        Super::Tick(DeltaTime);
        
        // Update visualization based on EEG data
        UpdateVisualization(DeltaTime);
    }
    
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override
    {
        if (OSCServer)
        {
            OSCServer->Stop();
        }
        
        Super::EndPlay(EndPlayReason);
    }
    
    // ============================================================
    // OSC MESSAGE HANDLERS
    // ============================================================
    
    void BindOSCHandlers()
    {
        if (!OSCServer) return;
        
        // Bind individual channel messages
        OSCServer->OnOscReceived.AddDynamic(this, &ANeuroVisOSCReceiver::OnOSCMessageReceived);
        
        UE_LOG(LogTemp, Log, TEXT("OSC message handlers bound"));
    }
    
    UFUNCTION()
    void OnOSCMessageReceived(const FOSCMessage& Message, const FString& IPAddress, int32 Port)
    {
        FString Address = Message.GetAddress();
        
        if (Message.GetArguments().Num() > 0 && Message.GetArguments()[0].IsFloat())
        {
            float Value = Message.GetArguments()[0].GetFloat();
            
            // Route to appropriate handler
            if (Address == "/eeg/CH1/alpha/absolute")
            {
                CH1_Alpha = Value;
                if (bDebugLogging) UE_LOG(LogTemp, Log, TEXT("CH1 Alpha: %.3f"), Value);
            }
            else if (Address == "/eeg/CH2/beta/absolute")
            {
                CH2_Beta = Value;
                if (bDebugLogging) UE_LOG(LogTemp, Log, TEXT("CH2 Beta: %.3f"), Value);
            }
            else if (Address == "/eeg/CH3/theta/absolute")
            {
                CH3_Theta = Value;
                if (bDebugLogging) UE_LOG(LogTemp, Log, TEXT("CH3 Theta: %.3f"), Value);
            }
            else if (Address == "/eeg/CH4/gamma/absolute")
            {
                CH4_Gamma = Value;
                if (bDebugLogging) UE_LOG(LogTemp, Log, TEXT("CH4 Gamma: %.3f"), Value);
            }
            else if (Address == "/eeg/alpha/averages")
            {
                Alpha_Avg = Value;
                if (bDebugLogging) UE_LOG(LogTemp, Log, TEXT("Alpha Avg: %.3f"), Value);
            }
            else if (Address == "/eeg/beta/averages")
            {
                Beta_Avg = Value;
            }
            else if (Address == "/eeg/theta/averages")
            {
                Theta_Avg = Value;
            }
            else if (Address == "/eeg/delta/averages")
            {
                Delta_Avg = Value;
            }
            else if (Address == "/eeg/gamma/averages")
            {
                Gamma_Avg = Value;
            }
        }
    }
    
    // ============================================================
    // VISUALIZATION
    // ============================================================
    
    void UpdateVisualization(float DeltaTime)
    {
        if (!SphereMesh) return;
        
        // Position controlled by alpha (Z-axis)
        float ZPos = Alpha_Avg * PositionMultiplier;
        FVector TargetLocation = FVector(0, 0, ZPos);
        FVector NewLocation = FMath::VInterpTo(GetActorLocation(), TargetLocation, DeltaTime, 2.0f);
        SetActorLocation(NewLocation);
        
        // Rotation controlled by beta
        float YawSpeed = Beta_Avg * 180.0f;
        FRotator NewRotation = GetActorRotation();
        NewRotation.Yaw += YawSpeed * DeltaTime;
        SetActorRotation(NewRotation);
        
        // Scale controlled by theta
        float TargetScale = 1.0f + (Theta_Avg * ScaleMultiplier);
        FVector CurrentScale = GetActorScale3D();
        FVector NewScale = FMath::VInterpTo(CurrentScale, FVector(TargetScale), DeltaTime, 2.0f);
        SetActorScale3D(NewScale);
        
        // Color controlled by gamma (cyan to magenta)
        if (DynamicMaterial)
        {
            FLinearColor Color = FMath::Lerp(FLinearColor::Blue, FLinearColor(1, 0, 1), Gamma_Avg);
            DynamicMaterial->SetVectorParameterValue(FName("BaseColor"), Color);
        }
    }
};

/*
 * ============================================================
 * BLUEPRINT-ONLY INSTRUCTIONS (NO C++ REQUIRED)
 * ============================================================
 * 
 * If you prefer to use Blueprints instead of C++:
 * 
 * 1. Create a new Blueprint Actor class
 * 
 * 2. Add OSC Server component:
 *    - Components panel → Add Component → OSC Server
 *    - Set Receive Port to 7400
 *    
 * 3. Add a Sphere static mesh component
 * 
 * 4. In Event Graph:
 * 
 *    EVENT BeginPlay
 *       ↓
 *    [OSC Server] → Listen
 *       ↓
 *    [OSC Server] → Bind Event to On OSC Message Received
 *    
 *    ON OSC MESSAGE RECEIVED
 *       ↓
 *    Get OSC Address (string)
 *       ↓
 *    SWITCH on String:
 *       case "/eeg/CH1/alpha/absolute":
 *          → Get Float Argument (index 0)
 *          → Set CH1_Alpha variable
 *          
 *       case "/eeg/alpha/averages":
 *          → Get Float Argument (index 0)
 *          → Set Alpha_Avg variable
 *          
 *       ... (repeat for all OSC addresses)
 *    
 *    EVENT TICK
 *       ↓
 *    Get Alpha_Avg
 *       ↓
 *    Multiply by 500
 *       ↓
 *    Make Vector (X=0, Y=0, Z=result)
 *       ↓
 *    Set Actor Location (with lerp for smoothness)
 * 
 * 5. Save and place in level
 * 
 * 6. Play and start NeuroVis OSC!
 */
