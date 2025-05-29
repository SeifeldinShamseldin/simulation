# Robot Simulation Platform

A comprehensive web-based URDF robot visualization and simulation platform developed for industrial robotics applications.

**Author:** Seifeldin Shamseldin  
**Organization:** Fraunhofer IWU & Botfellows  
**Project:** simulation

## Overview

This simulation platform provides a powerful browser-based environment for loading, visualizing, and controlling URDF (Unified Robot Description Format) robot models. It features real-time inverse kinematics, trajectory recording/playback, and comprehensive robot manipulation tools designed for industrial automation workflows.

## Key Features

### Core Functionality
- **URDF Robot Loading**: Support for standard URDF files with STL/DAE mesh formats
- **Real-time 3D Visualization**: High-performance rendering using Three.js
- **Joint Control**: Direct manipulation of robot joints with limit enforcement
- **Inverse Kinematics (IK)**: Real-time IK solver for end-effector positioning
- **Tool Center Point (TCP) Management**: Dynamic TCP configuration and tracking

### Advanced Features
- **Trajectory Recording & Playback**: Record and replay robot movements
- **Environment Management**: Add industrial objects (tables, conveyors, safety fences)
- **Multi-Robot Support**: Load and switch between multiple robot models
- **Physics Simulation**: Integrated Cannon.js physics engine
- **Import/Export**: Save and load robot configurations and trajectories

### Supported Robot Models
- Universal Robots (UR5, UR10)
- KUKA robots (KR3R540)
- Custom URDF models via upload interface

## Prerequisites

Before installation, ensure you have the following installed:

- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 7.0.0 or higher (comes with Node.js)
- **Git**: For cloning the repository
- **Modern Web Browser**: Chrome, Firefox, Safari, or Edge (latest versions)

## Installation

1. **Clone the repository**
   ```bash
   git clone [repository-url]
   cd simulation

Install dependencies
bashnpm install

Verify installation
bashnpm list


Running the Application
Development Mode
Start the development server with hot-reload:
bashnpm run dev
The application will be available at http://localhost:3000
Production Build
Create an optimized production build:
bashnpm run build
Preview Production Build
Test the production build locally:
bashnpm run preview
Start Backend Server
The application includes a backend server for robot management:
bashnpm run server
The server runs on http://localhost:3001
Usage Guide
Initial Setup

Open the application in your browser
Click the "Robot" link in the navigation bar to open the control panel

Loading a Robot

In the Robot Management section, select:

Manufacturer (e.g., Universal Robots, KUKA)
Robot Model (e.g., UR5, UR10)


Click "Load Robot" to visualize the model

Controlling Joints

Use the joint sliders in the "Joint Controls" section
Toggle "Ignore Joint Limits" for unrestricted movement
Click "Return to Zero" to reset all joints

Using Inverse Kinematics

Navigate to the "Inverse Kinematics" section
Enter target X, Y, Z coordinates
Click "Move Robot to Target" to calculate and execute movement

Recording Trajectories

Enter a trajectory name in the "Trajectory Recording" section
Click "Start Recording" and move the robot
Click "Stop Recording" when finished
Use "Play" to replay saved trajectories

Managing TCP (Tool Center Point)

Open the TCP section
Configure offset values for your end effector
Toggle visibility and adjust visual properties

Environment Setup

Click "Environment Objects" button
Select from available objects (tables, conveyors, etc.)
Click "Add" to place objects in the scene
Edit position, rotation, and scale as needed

Project Structure
simulation/
├── src/
│   ├── components/         # React UI components
│   │   ├── controls/      # Control panel components
│   │   ├── robot/         # Robot management
│   │   └── ViewerOptions/ # 3D viewer components
│   ├── core/              # Core functionality
│   │   ├── IK/           # Inverse kinematics system
│   │   ├── Loader/       # URDF and mesh loaders
│   │   ├── Scene/        # 3D scene management
│   │   └── services/     # Robot services
│   ├── contexts/          # React context providers
│   ├── utils/            # Utility functions
│   └── App.jsx           # Main application component
├── public/
│   ├── robots/           # Robot URDF and mesh files
│   ├── objects/          # Environment object models
│   └── tcp/              # TCP tool models
├── server/               # Backend server files
├── package.json          # Project dependencies
└── vite.config.js       # Vite configuration
Technologies
Frontend

React 18: Component-based UI framework
Three.js: 3D graphics and visualization
Vite: Fast build tool and development server

3D & Physics

Three.js r128: WebGL-based 3D graphics
Cannon-ES: Physics simulation engine
URDF Loader: Custom URDF parsing and loading

Backend

Express.js: Web server framework
Multer: File upload handling
CORS: Cross-origin resource sharing

State Management

React Context API: Global state management
EventBus: Real-time component communication

API Endpoints
Robot Management

GET /robots/list - List available robots
POST /api/robots/add - Upload new robot
DELETE /api/robots/:manufacturer/:model - Remove robot

TCP Management

GET /api/tcp/list - List TCP tools
POST /api/tcp/add - Add new TCP tool
DELETE /api/tcp/:id - Remove TCP tool

Configuration
Key configuration options can be found in:

src/utils/GlobalVariables.js - Application settings
vite.config.js - Build configuration
src/server/server.cjs - Server settings

Browser Compatibility

Chrome 90+
Firefox 88+
Safari 14+
Edge 90+

Performance Optimization
For optimal performance:

Use modern browsers with WebGL 2.0 support
Ensure hardware acceleration is enabled
Close unnecessary browser tabs
For complex robots, consider reducing mesh complexity

Troubleshooting
Common Issues
Robot not loading:

Check browser console for errors
Verify URDF file format
Ensure mesh files are in correct location

Slow performance:

Reduce shadow quality in settings
Disable unnecessary visual features
Check GPU acceleration settings

Server connection issues:

Verify server is running on port 3001
Check firewall settings
Ensure CORS is properly configured