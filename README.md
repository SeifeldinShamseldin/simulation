Robot Control System
A comprehensive web-based system for visualizing, controlling, and programming industrial robot arms using URDF models.
Features
![Robot Control System Architecture](./images/architecture.png)

3D visualization of industrial robots from URDF files
Forward and inverse kinematics control
Robot joint manipulation with UI sliders
Trajectory recording and playback
Tool Center Point (TCP) tracking and visualization
Support for multiple robot types (UR5, UR10, KUKA, etc.)

Installation
Prerequisites

Node.js (v16.0 or higher)
npm (v8.0 or higher)

Setup

Clone the repository:
bashgit clone https://github.com/yourusername/robot-control-system.git
cd robot-control-system

Install dependencies:
bashnpm install

Start the development server:
bashnpm run dev

Build for production:
bashnpm run build

Serve the production build:
bashnpm run serve


System Architecture

VR (Viewer Reference): A React ref object (viewerRef) pointing to the URDFViewer component that provides access to methods like loadRobot(), setJointValue(), and focusOnRobot() 
RP (React Provider): The RobotProvider component that wraps children components to give them access to robot context data 
RC (Robot Context): Provides access to currentRobot object, viewerRef, loadRobot() function, and robot state data through React's context system 
JV (Joint Values): Data objects containing: 
•	jointInfo[] - Array of joint information (name, type, limits)
•	jointValues{} - Object mapping joint names to their current angles
•	setJointValue() - Function to update a joint's position
TP (TCP Position): Tool Center Point position data including: 
•	tcpPosition{x,y,z} - Current TCP position coordinates
•	tcpSettings{} - Settings for TCP display and behavior
•	moveToPosition() - Function to move TCP to target position
IK (IK Control): Inverse Kinematics control props including: 
•	onIKUpdate callback function
•	viewerRef for accessing the robot model
EI (Execute IK): Function calls to perform inverse kinematics: 
•	executeIK(robot, targetPosition, options) - Calculates and applies joint positions
•	solve(robot, target) - Raw IK solver returning joint solutions
JU (Joint Updates): Sets joint angle values: 
•	setJointValue(jointName, angle) - Updates individual joints
•	setJointValues(valueObject) - Updates multiple joints at once
TR (Trajectory Recording): Functions for trajectory management: 
•	startRecording(name, options) - Begins recording robot movements
•	stopRecording() - Ends recording session
•	playTrajectory(name, robot, options) - Plays back recorded movements
TU (TCP Updates): TCP position data flowing from IKAPI to TrajectoryAPI: 
•	registerForTCPUpdates(callback) - Function for subscribing to position updates
•	tcpPosition{x,y,z} - Position data for recording in trajectory
CR (Create RobotState): Initialization of the RobotState instance: 
•	new RobotState(robotManager) - Creates state manager with reference to robotManager
CM (Create Manager): Initialization of the RobotManager: 
•	new RobotManager(sceneSetup) - Creates robot manager with reference to the scene
CS  (Create Scene): Initialization of the 3D scene: 
•	new SceneSetup(container, options) - Creates Three.js scene in the DOM container
RJ (Read Joints): Methods to access joint information: 
•	getJointValues() - Returns current joint positions
•	getJointsInfo() - Returns joint metadata including limits and types
LR (Load Robot): Robot loading commands: 
•	loadRobot(robotName, urdfPath) - Loads robot model from URDF file
•	setPackagesPath(path) - Sets the base path for resolving mesh files
US (Update Scene): Scene manipulation methods: 
•	updateSceneForRobot(robot) - Adjusts camera and lighting for robot
•	focusOnObject(robot) - Centers camera view on robot
GC (Global Config): Configuration settings including: 
•	backgroundColor, enableShadows, upAxis, showCollisions
•	defaultCameraPosition, groundSize, enableDragging
LE (Loader Events): Callback events during robot loading: 
•	onLoadStart(robotName) - Called when loading begins
•	onLoadComplete(robotName, robot) - Called when loading finishes
•	onLoadError(robotName, error) - Called when loading fails
LM (Load Mesh): 3D model loading functions: 
•	load(path, manager, done, material) - Loads mesh from STL/DAE files
•	createFallbackGeometry() - Creates placeholder geometry if loading fails
RC (Robot Config): Robot configuration data: 
•	getConfig(robotName) - Returns robot configuration object
•	resolveMeshPath(robotName, meshPath) - Resolves mesh file paths
RD (Robot Data): Server-provided robot information: 
•	robotDirectories[] - List of available robots
•	robotMetadata{} - Information about each robot model
EV (Events): Event data sent through EventBus: 
•	event.type - The event identifier
•	event.data - The payload/content of the event
•	event.timestamp - When the event occurred


Detailed Data Transfer Explanation

UI Component Connections
- App.jsx → RobotContext.jsx (RP): Creates the RobotProvider component wrapping the application
- App.jsx → URDFViewer.jsx (VR): Passes the viewerRef object reference for 3D visualization control
- App.jsx → Controls.jsx (VR): Passes the viewerRef object to access robot controls

Context System Connections
- RobotContext.jsx → useJointControl.js (RC): Provides viewerRef and currentRobot to the hook
- RobotContext.jsx → useTCP.js (RC): Provides viewerRef and currentRobot for TCP management
- useJointControl.js → IKController.jsx (JV): Provides jointInfo array, jointValues object, and setJointValue function
- useTCP.js → IKController.jsx (TP): Provides tcpPosition {x,y,z} and moveToPosition function

IK System Connections
- IKController.jsx → IKAPI.js (EI): Calls executeIK(robot, targetPosition) to perform inverse kinematics
- IKAPI.js → RobotManager.js (JU): Updates joint angles with setJointValue and animate functions

Trajectory System Connections
- TrajectoryViewer.jsx → TrajectoryAPI.js (TR): Calls startRecording(), stopRecording(), and playTrajectory() functions
- TrajectoryAPI.js → IKAPI.js (TU): Registers for TCP position updates during trajectory recording

Robot Management Connections
- URDFViewer.jsx → RobotState.js (CR): Creates the RobotState instance to manage robot state
- URDFViewer.jsx → RobotManager.js (CM): Creates the RobotManager to handle robot models
- URDFViewer.jsx → SceneSetup.js (CS): Creates the 3D scene for visualization
- RobotState.js → RobotManager.js (RJ): Reads joint values and limits
- RobotManager.js → URDFLoader.js (LR): Loads robot models with loadRobot(name, path)
- RobotManager.js → SceneSetup.js (US): Updates scene with robot models

Configuration and Utility Connections
- GlobalVariables.js → RobotManager.js (GC): Provides configuration settings like upAxis and showCollisions
- GlobalVariables.js → URDFLoader.js (LE): Defines loader events (onLoadStart, onLoadComplete)
- URDFLoader.js → MeshLoader.js (LM): Loads 3D mesh files for robot visualization
- RobotConfigRegistry.js → URDFLoader.js (RC): Provides robot configuration and package paths
- Server.js → RobotConfigRegistry.js (RD): Delivers robot data from the backend
- EventBus.js → DebugSystem.js (EV): Transmits event data for debugging

System Overview

The Robot Control System is built around a React application with three main layers:

1. UI Layer: React components that provide visualization and user interaction
   - URDFViewer.jsx creates the 3D visualization of the robot
   - Controls.jsx manages joint control, IK, and trajectory operations
   - IKController.jsx provides inverse kinematics control interface
   - TrajectoryViewer.jsx handles recording and playback of robot movements

2. State Management Layer: Context and hooks for data flow
   - RobotContext.jsx provides a central state for robot data
   - useJointControl.js gives components access to joint control
   - useTCP.js manages Tool Center Point position and control

3. Core Service Layer: Business logic implementation
   - IKAPI.js performs inverse kinematics calculations
   - TrajectoryAPI.js manages recording and playback of movements
   - RobotManager.js handles the robot model and joint manipulation
   - RobotState.js tracks the state of the robot's joints
   - SceneSetup.js manages the Three.js 3D scene
   - URDFLoader.js loads robot models from URDF files

4. Utility Layer: Support services
   - GlobalVariables.js provides configuration for the application
   - MeshLoader.js loads 3D mesh files
   - RobotConfigRegistry.js tracks available robot configurations
   - EventBus.js facilitates component communication
   - DebugSystem.js provides debugging capabilities

Data Flow

1. Robot Loading Flow: RobotContext → RobotManager → URDFLoader → SceneSetup
   - Robot models are loaded from URDF files and added to the 3D scene

2. Joint Control Flow: Controls → useJointControl → RobotManager → RobotState
   - User interactions with joint controls update the robot's joints

3. Inverse Kinematics Flow: IKController → IKAPI → RobotManager
   - User sets target positions, IKAPI calculates joint angles

4. Trajectory Flow: TrajectoryViewer → TrajectoryAPI → RobotManager
   - User records and plays back sequences of robot movements

The system prioritizes separation of concerns, with clear boundaries between UI, state management, and business logic. This architecture allows for easy extension and modification of individual components.




.
├── dist
│   ├── assets
│   │   ├── index-CmlHp0Ww.css
│   │   ├── index-DZX3C3-2.js
│   │   └── index-DZX3C3-2.js.map
│   ├── index.html
│   ├── robots
│   │   ├── ur10
│   │   │   ├── base.dae
│   │   │   ├── base.stl
│   │   │   ├── forearm.dae
│   │   │   ├── forearm.stl
│   │   │   ├── shoulder.dae
│   │   │   ├── shoulder.stl
│   │   │   ├── upperarm.dae
│   │   │   ├── upperarm.stl
│   │   │   ├── ur10.urdf
│   │   │   ├── wrist1.dae
│   │   │   ├── wrist1.stl
│   │   │   ├── wrist2.dae
│   │   │   ├── wrist2.stl
│   │   │   ├── wrist3.dae
│   │   │   └── wrist3.stl
│   │   └── ur5
│   │       ├── base.dae
│   │       ├── base.stl
│   │       ├── forearm.dae
│   │       ├── forearm.stl
│   │       ├── shoulder.dae
│   │       ├── shoulder.stl
│   │       ├── upperarm.dae
│   │       ├── upperarm.stl
│   │       ├── ur5.urdf
│   │       ├── wrist1.dae
│   │       ├── wrist1.stl
│   │       ├── wrist2.dae
│   │       ├── wrist2.stl
│   │       ├── wrist3.dae
│   │       └── wrist3.stl
│   └── vite.svg
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── public
│   ├── architecture.html
│   ├── robots
│   │   ├── kuka
│   │   │   └── kr3r540
│   │   │       ├── base_link.stl
│   │   │       ├── kr3r540.urdf
│   │   │       ├── link_1.stl
│   │   │       ├── link_2.stl
│   │   │       ├── link_3.stl
│   │   │       ├── link_4.stl
│   │   │       ├── link_5.stl
│   │   │       └── link_6.stl
│   │   └── Universal Robot
│   │       ├── ur10
│   │       │   ├── base.dae
│   │       │   ├── base.stl
│   │       │   ├── forearm.dae
│   │       │   ├── forearm.stl
│   │       │   ├── shoulder.dae
│   │       │   ├── shoulder.stl
│   │       │   ├── upperarm.dae
│   │       │   ├── upperarm.stl
│   │       │   ├── ur10.urdf
│   │       │   ├── wrist1.dae
│   │       │   ├── wrist1.stl
│   │       │   ├── wrist2.dae
│   │       │   ├── wrist2.stl
│   │       │   ├── wrist3.dae
│   │       │   └── wrist3.stl
│   │       └── ur5
│   │           ├── base.dae
│   │           ├── base.stl
│   │           ├── forearm.dae
│   │           ├── forearm.stl
│   │           ├── shoulder.dae
│   │           ├── shoulder.stl
│   │           ├── upperarm.dae
│   │           ├── upperarm.stl
│   │           ├── ur5.urdf
│   │           ├── wrist1.dae
│   │           ├── wrist1.stl
│   │           ├── wrist2.dae
│   │           ├── wrist2.stl
│   │           ├── wrist3.dae
│   │           └── wrist3.stl
│   └── vite.svg
├── README.md
├── src
│   ├── App.css
│   ├── App.jsx
│   ├── assets
│   │   └── react.svg
│   ├── components
│   │   ├── controls
│   │   │   ├── ActionButtons
│   │   │   │   └── ActionButtons.jsx
│   │   │   ├── ControlJoints
│   │   │   │   └── ControlJoints.jsx
│   │   │   ├── Controls.jsx
│   │   │   ├── IKController
│   │   │   │   ├── IKController.css
│   │   │   │   └── IKController.jsx
│   │   │   ├── RecordMap
│   │   │   │   ├── ExternalTrajectoryGraph.css
│   │   │   │   ├── ExternalTrajectoryGraph.jsx
│   │   │   │   ├── RecordMap.css
│   │   │   │   ├── RecordMap.jsx
│   │   │   │   └── TrajectoryViewer.jsx
│   │   │   ├── Reposition
│   │   │   │   ├── Reposition.css
│   │   │   │   └── Reposition.jsx
│   │   │   ├── RobotLoader
│   │   │   │   └── RobotLoader.jsx
│   │   │   └── TrajectoryControl
│   │   │       ├── TrajectoryControl.css
│   │   │       └── TrajectoryControl.jsx
│   │   ├── debug
│   │   │   └── DebugPanel.jsx
│   │   ├── NewRobot
│   │   │   ├── NewRobot.css
│   │   │   └── NewRobot.jsx
│   │   ├── robot
│   │   │   ├── RobotManager.js
│   │   │   └── RobotState.js
│   │   ├── TCPSettings
│   │   │   └── TCPModule.jsx
│   │   └── ViewerOptions
│   │       ├── URDFViewer.jsx
│   │       └── ViewerOptions.jsx
│   ├── contexts
│   │   ├── hooks
│   │   │   ├── useJointControl.js
│   │   │   └── useTCP.js
│   │   ├── RobotContext.jsx
│   │   └── services
│   │       └── RobotAPI.js
│   ├── core
│   │   ├── IK
│   │   │   ├── API
│   │   │   │   └── IKAPI.js
│   │   │   └── TCPSettings
│   │   │       ├── TCP.jsx
│   │   │       └── TCPSettings.jsx
│   │   ├── Loader
│   │   │   ├── URDFClasses.js
│   │   │   ├── URDFControls.js
│   │   │   └── URDFLoader.js
│   │   ├── Scene
│   │   │   └── SceneSetup.js
│   │   └── Trajectory
│   │       └── TrajectoryAPI.js
│   ├── index.css
│   ├── main.jsx
│   ├── server
│   │   └── server.cjs
│   └── utils
│       ├── DebugSystem.js
│       ├── EventBus.js
│       ├── GlobalVariables.js
│       ├── MeshLoader.js
│       └── RobotConfigRegistry.js
└── vite.config.js