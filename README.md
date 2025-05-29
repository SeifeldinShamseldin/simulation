Simulation - URDF Robot Visualization & Control Platform
Author: Seifeldin Shamseldin
Company: Fraunhofer IWU & Botfellows
Overview
Simulation is a comprehensive web-based platform for visualizing, controlling, and simulating URDF robot models. The application provides real-time robot manipulation, inverse kinematics solving, trajectory recording/playback, and advanced TCP (Tool Center Point) management capabilities.
System Requirements

Node.js: v16.0.0 or higher
npm: v7.0.0 or higher
Browser: Chrome, Firefox, Safari, or Edge (latest versions)
Operating System: Windows 10/11, macOS 10.15+, or Ubuntu 20.04+

Required Libraries & Dependencies
Core Dependencies

React (v18.2.0) - UI framework
Three.js (v0.152.2) - 3D graphics and visualization
Cannon-ES (v0.20.0) - Physics engine
Vite (v6.3.5) - Build tool and development server
Express (v5.1.0) - Backend server

Additional Libraries

Bootstrap (v5.3.6) - UI styling
Lodash (v4.17.21) - Utility functions
Multer (v2.0.0) - File upload handling
CORS (v2.8.5) - Cross-origin resource sharing

Installation

Clone the repository
bashgit clone [repository-url]
cd simulation

Install dependencies
bashnpm install

Verify installation
bashnpm list


Running the Application
Development Mode
Start both the frontend and backend servers simultaneously:
bashnpm run dev
This will:

Start the Express server on port 3001
Start the Vite development server on port 3000
Open the application in your default browser

Production Build

Build the application
bashnpm run build

Preview the production build
bashnpm run preview


Manual Server Start
If you need to run servers separately:
bash# Terminal 1 - Backend server
npm run server

# Terminal 2 - Frontend
npx vite
Initial Setup & Configuration
1. Robot Models
The application expects robot models in the public/robots/ directory. Structure:
public/robots/
├── [Manufacturer]/
│   └── [Model]/
│       ├── [model].urdf
│       └── [mesh files (.stl, .dae)]
2. Default Robots
The application comes pre-configured with support for:

Universal Robots (UR5, UR10)
KUKA robots (KR3R540)

3. Environment Variables (Optional)
Create a .env file in the root directory:
envVITE_API_URL=http://localhost:3001
VITE_PORT=3000
Usage Guide
Basic Operations

Loading a Robot

Click the "Robot" link in the navigation bar
Select manufacturer and model from the dropdown
Click "Load Robot"


Joint Control

Use the joint sliders to control individual joint angles
Toggle "Ignore Joint Limits" for unrestricted movement
Click "Return to Zero" to reset all joints


Inverse Kinematics

Enter target X, Y, Z coordinates
Click "Move Robot to Target"
Use "Use Current Position" to set current TCP as target


Trajectory Recording

Enter a trajectory name
Set recording interval (default: 100ms)
Click "Start Recording" and move the robot
Click "Stop Recording" when done


TCP Management

View current TCP position in real-time
Add custom TCP tools with STL files
Configure TCP offset and visualization settings



Advanced Features

Environment Objects: Add tables, conveyors, and other objects to the scene
3D Trajectory Visualization: View recorded trajectories in 3D space
Import/Export: Save and load trajectory files (JSON format)
Multi-robot Support: Load and switch between different robot models

API Endpoints
The backend server provides the following endpoints:

GET /robots/list - Get available robots
POST /api/robots/add - Add new robot
DELETE /api/robots/:manufacturer/:model - Remove robot
GET /api/tcp/list - Get TCP tools
POST /api/tcp/add - Add TCP tool
DELETE /api/tcp/:id - Remove TCP tool

Troubleshooting
Common Issues

Port Already in Use
bash# Kill process on port 3000
npx kill-port 3000

# Kill process on port 3001
npx kill-port 3001

Module Not Found Errors
bash# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

CORS Issues

Ensure the backend server is running on port 3001
Check proxy configuration in vite.config.js


Robot Not Loading

Verify URDF file path is correct
Check browser console for mesh loading errors
Ensure all mesh files are in lowercase



Performance Optimization

Enable hardware acceleration in your browser
Close unnecessary browser tabs
Use production build for better performance
Reduce trajectory recording interval for smoother playback

Browser Compatibility

Chrome/Edge: Full support (recommended)
Firefox: Full support
Safari: Full support (WebGL required)

License & Copyright
© 2024 Fraunhofer IWU & Botfellows. All rights reserved.