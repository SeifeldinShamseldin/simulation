// src/components/robot/ViewerOptions/URDFViewer.jsx - Updated for unified context
import React, { useEffect, useRef } from 'react';
import { useViewer } from '../../../contexts/hooks/useViewer';
import { useViewerControl } from '../../../contexts/hooks/useViewer';
import { useRobot } from '../../../contexts/hooks/useRobot';
import EventBus from '../../../utils/EventBus';

const URDFViewer = React.forwardRef(({
  robotName = '',
  urdfPath = '',
  width = '100%',
  height = '100%',
  backgroundColor = '#f5f5f5',
  enableShadows = true,
  upAxis = '+Z',
  enableDragging = false,
  highlightColor = '#ff0000',
  onRobotLoad,
  onJointChange
}, ref) => {
  const containerRef = useRef(null);
  const viewer = useViewer();
  const { setContainer, focusOnRobot } = useViewerControl();
  const { 
    loadRobot,
    getRobot,
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    isLoading,
    error,
    loadedRobots,
    activeRobotId,
    setActiveRobotId,
    unloadRobot,
    activeRobot
  } = useRobot();
  
  // Initialize viewer compatibility layer
  useEffect(() => {
    if (containerRef.current && viewer.setViewerInstance) {
      // Create a compatibility object that matches the old API
      const viewerCompat = {
        // Robot loading (now handled by unified context)
        loadRobot: async (robotId, path, options) => {
          const robot = await loadRobot(robotId, path, options);
          if (robot && viewer.getSceneSetup) {
            const sceneSetup = viewer.getSceneSetup();
            if (sceneSetup && sceneSetup.focusOnObject) {
              setTimeout(() => sceneSetup.focusOnObject(robot, 0.8), 100);
            }
          }
          return robot;
        },
        
        // Focus on robot
        focusOnRobot: (robotId, forceRefocus) => {
          const robot = getRobot(robotId);
          if (robot && viewer.getSceneSetup) {
            const sceneSetup = viewer.getSceneSetup();
            if (sceneSetup && sceneSetup.focusOnObject) {
              sceneSetup.focusOnObject(robot, 0.8);
            }
          }
        },
        
        // Joint control
        setJointValue: (robotId, jointName, value) => setJointValue(robotId, jointName, value),
        setJointValues: (robotId, values) => setJointValues(robotId, values),
        getJointValues: (robotId) => getJointValues(robotId),
        resetJoints: (robotId) => resetJoints(robotId),
        
        // Scene access
        getSceneSetup: viewer.getSceneSetup,
        
        // Robot manager reference (for compatibility)
        robotLoaderRef: { 
          current: {
            loadRobot,
            getRobot,
            setJointValue,
            setJointValues,
            getJointValues,
            resetJoints
          }
        }
      };
      
      viewer.setViewerInstance(viewerCompat);
    }
  }, [viewer, loadRobot, getRobot, setJointValue, setJointValues, getJointValues, resetJoints]);
  
  // Initialize enhanced viewer if available
  useEffect(() => {
    if (containerRef.current && viewer.initializeViewer) {
      viewer.initializeViewer(containerRef.current, {
        backgroundColor,
        enableShadows,
        upAxis,
        highlightColor
      });
    } else if (containerRef.current) {
      setContainer(containerRef.current);
    }
  }, [viewer, setContainer, backgroundColor, enableShadows, upAxis, highlightColor]);
  
  // Load robot when props change
  useEffect(() => {
    if (viewer.isViewerReady && robotName && urdfPath) {
      loadRobot(robotName, urdfPath, {
        makeActive: true,
        position: { x: 0, y: 0, z: 0 }
      }).then(robot => {
        if (onRobotLoad) onRobotLoad(robot);
      }).catch(err => {
        console.error('Failed to load robot:', err);
      });
    }
  }, [viewer.isViewerReady, robotName, urdfPath, loadRobot, onRobotLoad]);
  
  // Listen for joint changes if handler provided
  useEffect(() => {
    if (!onJointChange) return;
    
    const handleJointChange = (data) => {
      const values = getJointValues(data.robotId || data.robotName);
      onJointChange(data.jointName, values);
    };
    
    const unsubscribe = EventBus.on('robot:joint-changed', handleJointChange);
    return () => unsubscribe();
  }, [onJointChange, getJointValues]);
  
  // Expose methods via ref (maintain compatibility)
  React.useImperativeHandle(ref, () => ({
    // Robot methods - now using unified context
    loadRobot: (robotId, path, options) => loadRobot(robotId, path, options),
    getAllRobots: () => loadedRobots,
    getRobot: (robotId) => getRobot(robotId),
    setRobotActive: (robotId, isActive) => {
      if (isActive) {
        setActiveRobotId(robotId);
      } else {
        setActiveRobotId(null);
      }
    },
    removeRobot: (robotId) => unloadRobot(robotId),
    
    // Joint methods
    setJointValue: (robotId, jointName, value) => setJointValue(robotId, jointName, value),
    setJointValues: (robotId, values) => setJointValues(robotId, values),
    getJointValues: (robotId) => getJointValues(robotId),
    resetJoints: (robotId) => resetJoints(robotId),
    updateJointValues: (robotId, values) => setJointValues(robotId, values), // Alias
    
    // Viewer methods
    focusOnRobot: (robotId) => {
      const robot = getRobot(robotId);
      if (robot && viewer.getSceneSetup) {
        const sceneSetup = viewer.getSceneSetup();
        if (sceneSetup && sceneSetup.focusOnObject) {
          sceneSetup.focusOnObject(robot, 0.8);
        }
      }
    },
    getCurrentRobot: () => activeRobot,
    getSceneSetup: viewer.getSceneSetup,
    
    // State getters
    getRobotState: () => loadedRobots,
    getRobotInfo: () => ({
      totalRobots: loadedRobots.size,
      activeRobots: activeRobotId ? [activeRobotId] : []
    }),
    
    // Compatibility
    robotLoaderRef: { 
      current: {
        loadRobot,
        getRobot,
        setJointValue,
        setJointValues,
        getJointValues,
        resetJoints
      }
    },
    
    // Resize handler
    resize: () => {
      if (viewer.handleResize) {
        viewer.handleResize();
      }
    },
    
    // Table methods (if viewer supports them)
    loadTable: viewer.loadTable || (() => Promise.resolve(false)),
    toggleTable: viewer.toggleTable || (() => {}),
    isTableLoaded: viewer.isTableLoaded || (() => false),
    isTableVisible: viewer.isTableVisible || (() => false)
  }), [viewer, loadRobot, getRobot, setJointValue, setJointValues, getJointValues, resetJoints, loadedRobots, activeRobotId, activeRobot, setActiveRobotId, unloadRobot]);
  
  return (
    <div 
      ref={containerRef}
      style={{
        width,
        height,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        backgroundColor
      }}
    >
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#fff',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '1rem 2rem',
          borderRadius: '4px',
          zIndex: 1000
        }}>
          Loading robot...
        </div>
      )}
      
      {error && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          padding: '10px 20px',
          backgroundColor: 'rgba(255, 0, 0, 0.7)',
          color: 'white',
          borderRadius: '4px',
          zIndex: 1000
        }}>
          {error}
        </div>
      )}
    </div>
  );
});

URDFViewer.displayName = 'URDFViewer';

export default URDFViewer;