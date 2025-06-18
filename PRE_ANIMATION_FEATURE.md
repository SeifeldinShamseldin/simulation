# Pre-Animation Feature for Trajectory Playback

## Overview

The pre-animation feature allows robots to smoothly move to the starting position of a trajectory before playback begins. This ensures that the robot is in the correct position to execute the recorded trajectory accurately.

## Features

### 1. Automatic Pre-Animation
- **Enabled by default**: When `animateToStart` is `true` (default), the robot will automatically move to the trajectory's starting position
- **Smart detection**: Only performs pre-animation if the robot needs to move (difference > 0.001 radians)
- **Smooth motion**: Uses motion profiles (S-curve or trapezoidal) for natural robot movement

### 2. Configurable Options
- **`animateToStart`**: Enable/disable pre-animation (default: `true`)
- **`animationDuration`**: Duration of pre-animation in milliseconds (default: 2000ms)
- **`animationProfile`**: Motion profile type - 's-curve' (smooth) or 'trapezoidal' (linear)

### 3. Visual Feedback
- **Progress indicator**: Shows pre-animation progress in the UI
- **Status updates**: Displays when pre-animation is in progress
- **Event system**: Emits events for integration with other components

## Usage

### Basic Usage
```javascript
// Play trajectory with default pre-animation settings
playTrajectory(trajectoryInfo, {
  speed: 1.0,
  loop: false
});
```

### Custom Pre-Animation Settings
```javascript
// Customize pre-animation behavior
playTrajectory(trajectoryInfo, {
  speed: 1.0,
  loop: false,
  animateToStart: true,        // Enable pre-animation
  animationDuration: 3000,     // 3 seconds
  animationProfile: 's-curve'  // Smooth motion
});
```

### Disable Pre-Animation
```javascript
// Skip pre-animation entirely
playTrajectory(trajectoryInfo, {
  speed: 1.0,
  loop: false,
  animateToStart: false
});
```

## Events

The feature emits several events that can be listened to:

### `trajectory:pre-animation-started`
Emitted when pre-animation begins:
```javascript
{
  robotId: "robot_123",
  trajectoryName: "test_trajectory",
  currentPosition: { joint_1: 0, joint_2: 1.5, ... },
  targetPosition: { joint_1: 0, joint_2: 0, ... }
}
```

### `trajectory:pre-animation-progress`
Emitted during pre-animation with progress updates:
```javascript
{
  robotId: "robot_123",
  trajectoryName: "test_trajectory",
  progress: 0.75  // 75% complete
}
```

### `trajectory:pre-animation-completed`
Emitted when pre-animation finishes:
```javascript
{
  robotId: "robot_123",
  trajectoryName: "test_trajectory"
}
```

## Implementation Details

### Core Components
1. **useTrajectory.js**: Main hook with pre-animation logic
2. **JointContext.jsx**: Provides `animateToJointValues` function
3. **TrajectoryViewer.jsx**: UI controls and status display

### Key Functions
- `animateToJointValues()`: Smooth joint animation using motion profiles
- `playTrajectory()`: Enhanced with pre-animation support
- Event system: Real-time status updates

### Motion Profiles
- **S-Curve**: Smooth acceleration/deceleration (default)
- **Trapezoidal**: Linear acceleration with constant velocity

## UI Integration

The TrajectoryViewer component includes:
- Pre-animation settings panel
- Progress indicator during pre-animation
- Disabled controls during pre-animation
- Visual status updates

## Benefits

1. **Accuracy**: Ensures robot starts from correct position
2. **Safety**: Smooth movement prevents jerky motions
3. **User Experience**: Clear feedback on pre-animation status
4. **Flexibility**: Configurable options for different use cases
5. **Integration**: Event system allows other components to respond

## Technical Notes

- Pre-animation uses the same motion profile system as regular joint animations
- Tolerance of 0.001 radians for movement detection
- 500ms delay between pre-animation completion and trajectory start
- Compatible with existing trajectory playback system
- No breaking changes to existing API 