// src/components/robot/ViewerOptions/URDFViewer.jsx - Updated to use unified RobotContext
import React, { useEffect, useRef } from 'react';
import { useViewer } from '../../../contexts/hooks/useViewer';
import { useViewerControl } from '../../../contexts/hooks/useViewer';
import { useRobotContext } from '../../../contexts/RobotContext'; // Updated import
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
  const robotContext = useRobotContext(); // Using unified context
  
  // Initialize viewer by setting it as the instance
  useEffect(() => {
    if (containerRef.current && viewer.setViewerInstance) {
      // Create a compatibility object that matches the old API
      const viewerCompat = {
        loadRobot: robotContext.loadRobot,
        focusOnRobot,
        resetJoints: robotContext.resetJoints,
        getSceneSetup: viewer.getSceneSetup,
        robotLoaderRef: { current: robotContext } // Point to unified context
      };
      
      viewer.setViewerInstance(viewerCompat);
    }
  }, [viewer, robotContext, focusOnRobot]);
  
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
      robotContext.loadRobot(robotName, urdfPath).then(robot => {
        if (onRobotLoad) onRobotLoad(robot);
        // Focus on loaded robot
        setTimeout(() => focusOnRobot(robotName), 100);
      });
    }
  }, [viewer.isViewerReady, robotName, urdfPath, robotContext, onRobotLoad, focusOnRobot]);
  
  // Listen for joint changes if handler provided
  useEffect(() => {
    if (!onJointChange) return;
    
    const handleJointChange = (data) => {
      const values = robotContext.getJointValues(data.robotName || robotContext.getCurrentRobotName());
      onJointChange(data.jointName, values);
    };
    
    const unsubscribe = EventBus.on('robot:joint-changed', handleJointChange);
    return () => unsubscribe();
  }, [onJointChange, robotContext]);
  
  // Expose methods via ref (maintain compatibility)
  React.useImperativeHandle(ref, () => ({
    // Robot methods
    loadRobot: robotContext.loadRobot,
    getAllRobots: robotContext.getAllRobots,
    getRobot: robotContext.getRobot,
    setRobotActive: robotContext.setRobotActive,
    removeRobot: robotContext.removeRobot,
    
    // Joint methods
    setJointValue: robotContext.setJointValue,
    setJointValues: robotContext.setJointValues,
    getJointValues: robotContext.getJointValues,
    resetJoints: robotContext.resetJoints,
    updateJointValues: robotContext.setJointValues, // Alias for compatibility
    
    // Viewer methods
    focusOnRobot,
    getCurrentRobot: robotContext.getCurrentRobot,
    getSceneSetup: viewer.getSceneSetup,
    
    // State getters
    getRobotState: robotContext.getAllRobots,
    getRobotInfo: () => ({
      totalRobots: robotContext.robotCount,
      activeRobots: robotContext.getActiveRobots()
    }),
    
    // Compatibility
    robotLoaderRef: { current: robotContext },
    
    // Table methods (TODO: implement in viewer context)
    loadTable: async () => false,
    toggleTable: () => {},
    isTableLoaded: () => false,
    isTableVisible: () => false
  }), [robotContext, viewer, focusOnRobot]);
  
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
      {robotContext.isLoading && (
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
      
      {robotContext.error && (
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
          {robotContext.error}
        </div>
      )}
    </div>
  );
});

URDFViewer.displayName = 'URDFViewer';

export default URDFViewer;