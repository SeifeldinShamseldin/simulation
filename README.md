# Simulation

A comprehensive robot simulation workspace that provides an interactive 3D environment for visualizing and controlling robotic systems. Built with React and Three.js, this application offers a modern interface for robot simulation and analysis.

## Features

- Interactive 3D robot visualization
- Real-time robot control interface
- URDF model support
- Workspace management
- Simulation controls
- Analytics dashboard
- Comprehensive documentation

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd simulation
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Project Structure

```
simulation/
├── src/
│   ├── components/     # React components
│   ├── scenes/        # Three.js scenes
│   ├── models/        # 3D models and URDF files
│   └── utils/         # Utility functions
├── public/            # Static assets
└── index.html         # Entry point
```

## Technologies Used

- React
- Three.js
- React Three Fiber
- URDF Loader
- Vite

## License

This project is licensed under the MIT License - see the LICENSE file for details.