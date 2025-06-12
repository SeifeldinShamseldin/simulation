// src/components/ViewerOptions/URDFViewer.jsx - REFACTORED
import React, { useEffect, useRef } from 'react';
import { useViewer } from '../../contexts/ViewerContext';
import { useViewerControl } from '../../contexts/hooks/useViewerEnhanced';
import { useRobotManager } from '../../contexts/hooks/useRobotManager';
import EventBus from '../../utils/EventBus';

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
  const robotManager = useRobotManager();
  
  // Initialize viewer by setting it as the instance
  useEffect(() => {
    if (containerRef.current && viewer.setViewerInstance) {
      // Create a compatibility object that matches the old API
      const viewerCompat = {
        loadRobot: robotManager.loadRobot,
        focusOnRobot,
        resetJoints: robotManager.resetJoints,
        getSceneSetup: viewer.getSceneSetup,
        robotLoaderRef: { current: robotManager }
      };
      
      viewer.setViewerInstance(viewerCompat);
    }
  }, [viewer, robotManager, focusOnRobot]);
  
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
      robotManager.loadRobot(robotName, urdfPath).then(robot => {
        if (onRobotLoad) onRobotLoad(robot);
        // Focus on loaded robot
        setTimeout(() => focusOnRobot(robotName), 100);
      });
    }
  }, [viewer.isViewerReady, robotName, urdfPath, robotManager, onRobotLoad, focusOnRobot]);
  
  // Listen for joint changes if handler provided
  useEffect(() => {
    if (!onJointChange) return;
    
    const handleJointChange = (data) => {
      const values = robotManager.getJointValues(data.robotName || robotManager.getCurrentRobotName());
      onJointChange(data.jointName, values);
    };
    
    const unsubscribe = EventBus.on('robot:joint-changed', handleJointChange);
    return () => unsubscribe();
  }, [onJointChange, robotManager]);
  
  // Expose methods via ref (maintain compatibility)
  React.useImperativeHandle(ref, () => ({
    // Robot methods
    loadRobot: robotManager.loadRobot,
    getAllRobots: robotManager.getAllRobots,
    getRobot: robotManager.getRobot,
    setRobotActive: robotManager.setRobotActive,
    removeRobot: robotManager.removeRobot,
    
    // Joint methods
    setJointValue: robotManager.setJointValue,
    setJointValues: robotManager.setJointValues,
    getJointValues: robotManager.getJointValues,
    resetJoints: robotManager.resetJoints,
    updateJointValues: robotManager.setJointValues, // Alias for compatibility
    
    // Viewer methods
    focusOnRobot,
    getCurrentRobot: robotManager.getCurrentRobot,
    getSceneSetup: viewer.getSceneSetup,
    
    // State getters
    getRobotState: robotManager.getAllRobots,
    getRobotInfo: () => ({
      totalRobots: robotManager.robotCount,
      activeRobots: robotManager.getActiveRobots()
    }),
    
    // Compatibility
    robotLoaderRef: { current: robotManager },
    
    // Table methods (TODO: implement in viewer context)
    loadTable: async () => false,
    toggleTable: () => {},
    isTableLoaded: () => false,
    isTableVisible: () => false
  }), [robotManager, viewer, focusOnRobot]);
  
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
      {robotManager.isLoading && (
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
      
      {robotManager.error && (
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
          {robotManager.error}
        </div>
      )}
    </div>
  );
});

URDFViewer.displayName = 'URDFViewer';

export default URDFViewer;