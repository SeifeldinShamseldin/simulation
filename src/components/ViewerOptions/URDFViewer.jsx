import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SceneSetup from '../../core/Scene/SceneSetup';
import { useViewer } from '../../contexts/ViewerContext';
import { useRobot } from '../../contexts/hooks/useRobot';
import { PointerURDFDragControls } from '../../core/Loader/URDFControls';
import EventBus from '../../utils/EventBus';

const DEFAULT_CONFIG = {
  backgroundColor: '#f5f5f5',
  enableShadows: true,
  ambientColor: '#8ea0a8',
  upAxis: '+Z',
  highlightColor: '#ff0000'
};

const EVENTS = {
  onLoadStart: 'robot:load-start',
  onLoadComplete: 'robot:load-complete',
  onLoadError: 'robot:load-error',
  onJointChange: 'robot:joint-change'
};

const Logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args)
};

/**
 * URDF Viewer component - Updated to use unified RobotContext
 * ❌ Removed: RobotLoader dependency
 * ✅ Added: Direct useRobot() integration
 */
const URDFViewer = ({
  robotName = '', 
  urdfPath = '',
  width = '100%',
  height = '100%',
  backgroundColor = DEFAULT_CONFIG.backgroundColor,
  enableShadows = DEFAULT_CONFIG.enableShadows,
  showCollision = DEFAULT_CONFIG.showCollisions,
  upAxis = DEFAULT_CONFIG.upAxis,
  enableDragging = DEFAULT_CONFIG.enableDragging,
  highlightColor = DEFAULT_CONFIG.highlightColor,
  onRobotLoad,
  onJointChange
}, ref) => {
  // References for DOM elements and scene
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const dragControlsRef = useRef(null);
  
  // ✅ Robot context hook - unified API (replaces RobotLoader)
  const {
    loadRobot,
    getAll3DRobots,
    get3DRobot,
    setJointValue,
    setJointValues,
    getJointValues,
    resetJoints,
    activeRobotId,
    isLoading,
    error: robotError
  } = useRobot();
  
  // State for tracking loading status and joint info
  const [error, setError] = useState(null);
  const [loadedRobot, setLoadedRobot] = useState(null);
  const [localJointValues, setLocalJointValues] = useState({});
  
  // Table-related state
  const [tableLoaded, setTableLoaded] = useState(false);
  const [tableVisible, setTableVisible] = useState(false);
  
  // Initialize scene setup
  useEffect(() => {
    if (!containerRef.current) return;
    
    Logger.info('Initializing URDF Viewer');
    
    // Create scene setup with adjusted camera settings
    const sceneSetup = new SceneSetup({
      container: containerRef.current,
      backgroundColor,
      enableShadows,
      ambientColor: DEFAULT_CONFIG.ambientColor
    });
    
    // Adjust camera for better view
    if (sceneSetup.camera) {
      sceneSetup.camera.fov = 50;
      sceneSetup.camera.near = 0.01;
      sceneSetup.camera.far = 1000;
      sceneSetup.camera.updateProjectionMatrix();
    }
    
    sceneRef.current = sceneSetup;
    
    // Configure UI options
    sceneSetup.setUpAxis(upAxis);
    
    // Set up event handlers
    setupEventHandlers();
    
    // Listen to scene events for coordination
    const unsubscribeCamera = EventBus.on('scene:camera-updated', (data) => {
      Logger.debug('Camera updated:', data);
    });
    
    const unsubscribeObjects = EventBus.on('scene:object-added', (data) => {
      Logger.debug('Object added to scene:', data);
    });
    
    return () => {
      // Clean up
      Logger.info('Cleaning up URDF Viewer');
      
      if (dragControlsRef.current) {
        dragControlsRef.current.dispose();
        dragControlsRef.current = null;
      }
      
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      
      // Clean up event listeners
      unsubscribeCamera();
      unsubscribeObjects();
    };
  }, [backgroundColor, enableShadows, showCollision, upAxis]);
  
  // Load the robot model when robotName or urdfPath changes
  useEffect(() => {
    if (!urdfPath || !robotName) return;
    
    loadRobotModel(robotName, urdfPath);
  }, [robotName, urdfPath]);
  
  // Set up drag controls when enableDragging or highlightColor changes
  useEffect(() => {
    if (!sceneRef.current) return;
    
    if (enableDragging) {
      setupDragControls();
    } else if (dragControlsRef.current) {
      dragControlsRef.current.dispose();
      dragControlsRef.current = null;
    }
  }, [enableDragging, highlightColor, loadedRobot]);
  
  // Add resize handling effect
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      // Update camera aspect ratio
      if (sceneRef.current.camera) {
        sceneRef.current.camera.aspect = width / height;
        sceneRef.current.camera.updateProjectionMatrix();
        
        // Force re-focus on first active robot if available
        const allRobots = getAll3DRobots();
        if (allRobots && allRobots.size > 0) {
          const firstRobot = Array.from(allRobots.values())[0];
          if (firstRobot && firstRobot.model) {
            sceneRef.current.focusOnObject(firstRobot.model);
          }
        }
      }
      
      // Update renderer size
      if (sceneRef.current.renderer) {
        sceneRef.current.renderer.setSize(width, height);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Initial resize
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [getAll3DRobots]);
  
  /**
   * Set up event handlers for robot loading and joint changes
   */
  const setupEventHandlers = () => {
    // Listen for robot load events from RobotContext
    const unsubscribeLoaded = EventBus.on('robot:loaded', (data) => {
      const { robotName: name, robot } = data;
      Logger.info(`Robot loaded: ${name}`);
      setLoadedRobot(robot);
      
      // Get current joint values from the unified context
      if (activeRobotId) {
        const currentValues = getJointValues(activeRobotId);
        setLocalJointValues(currentValues);
      }
      
      if (onRobotLoad) {
        onRobotLoad(robot);
      }
    });
    
    // Listen for joint change events
    const unsubscribeJointChanged = EventBus.on('robot:joint-changed', (data) => {
      const { jointName, value, robotId } = data;
      
      // Update local state with the new joint values
      if (robotId && robotId === activeRobotId) {
        const updatedValues = getJointValues(robotId);
        setLocalJointValues({...updatedValues});
        
        // Notify parent component
        if (onJointChange) {
          onJointChange(jointName, updatedValues);
        }
      }
    });
    
    // Listen for multiple joint changes
    const unsubscribeJointsChanged = EventBus.on('robot:joints-changed', (data) => {
      const { values, robotId } = data;
      
      // Update local state
      if (robotId && robotId === activeRobotId) {
        const updatedValues = getJointValues(robotId);
        setLocalJointValues({...updatedValues});
        
        // Notify parent component
        if (onJointChange) {
          onJointChange(null, updatedValues);
        }
      }
    });
    
    return () => {
      unsubscribeLoaded();
      unsubscribeJointChanged();
      unsubscribeJointsChanged();
    };
  };
  
  /**
   * Set up drag controls for manipulating the robot
   */
  const setupDragControls = () => {
    if (dragControlsRef.current) {
      dragControlsRef.current.dispose();
    }
    
    const scene = sceneRef.current;
    if (!scene || !scene.scene || !scene.camera || !scene.renderer || !scene.renderer.domElement) {
      return;
    }
    
    // Create highlight material
    const highlightMaterial = new THREE.MeshPhongMaterial({
      shininess: 10,
      color: new THREE.Color(highlightColor),
      emissive: new THREE.Color(highlightColor),
      emissiveIntensity: 0.25,
    });
    
    // Find the nearest joint and highlight it
    const isJoint = (j) => j.isURDFJoint && j.jointType !== 'fixed';
    
    // Highlight link geometry under a joint
    const highlightLinkGeometry = (joint, revert) => {
      if (!joint) return;
      
      // Safe traverse function with object checks
      const traverse = (obj) => {
        if (!obj) return;
        
        // Safe check for mesh type
        if (obj.type === 'Mesh') {
          if (revert) {
            if (obj.__origMaterial) {
              obj.material = obj.__origMaterial;
              delete obj.__origMaterial;
            }
          } else {
            obj.__origMaterial = obj.material;
            obj.material = highlightMaterial;
          }
        }
        
        // Safe check for children
        if (!obj.children) return;
        
        // Process children if this is not another joint
        if (obj === joint || !isJoint(obj)) {
          for (let i = 0; i < obj.children.length; i++) {
            const child = obj.children[i];
            if (child && !child.isURDFCollider) {
              traverse(child);
            }
          }
        }
      };
      
      traverse(joint);
    };
    
    // Create drag controls
    const dragControls = new PointerURDFDragControls(
      scene.scene,
      scene.camera,
      scene.renderer.domElement
    );
    
    // Set up drag event handlers
    dragControls.onDragStart = (joint) => {
      Logger.debug('Drag start:', joint.name);
      scene.controls.enabled = false;
    };
    
    dragControls.onDragEnd = (joint) => {
      Logger.debug('Drag end:', joint.name);
      scene.controls.enabled = true;
      
      // Update joint values in the unified context after manual manipulation
      if (activeRobotId && onJointChange) {
        const updatedValues = getJointValues(activeRobotId);
        onJointChange(joint.name, updatedValues);
      }
    };
    
    dragControls.onHover = (joint) => {
      Logger.debug('Hover:', joint.name);
      highlightLinkGeometry(joint, false);
    };
    
    dragControls.onUnhover = (joint) => {
      Logger.debug('Unhover:', joint.name);
      highlightLinkGeometry(joint, true);
    };
    
    dragControlsRef.current = dragControls;
  };
  
  /**
   * Load a robot model using the unified RobotContext
   */
  const loadRobotModel = async (name, path) => {
    try {
      setError(null);
      
      Logger.info(`Loading robot ${name} from ${path}`);
      
      // ✅ Use the unified RobotContext to load the robot
      await loadRobot(name, path, {
        position: { x: 0, y: 0, z: 0 },
        makeActive: true,
        clearOthers: false
      });
      
      // Force a better camera view after loading
      setTimeout(() => {
        if (sceneRef.current) {
          const robot = get3DRobot(name);
          if (robot) {
            // Apply custom focusing with reduced padding
            sceneRef.current.focusOnObject(robot, 0.8);
            
            // Hide any fallback geometries (red cubes)
            robot.traverse((child) => {
              if (child.isMesh && child.material) {
                // Check if this is likely a fallback geometry
                if (child.geometry instanceof THREE.BoxGeometry) {
                  const size = child.geometry.parameters;
                  if (size.width === 0.1 && size.height === 0.1 && size.depth === 0.1) {
                    child.visible = false;
                    Logger.debug('Hidden fallback geometry');
                  }
                }
              }
            });
          }
        }
      }, 100);
    } catch (err) {
      Logger.error('Error loading robot:', err);
      setError(err.message || 'Failed to load robot');
    }
  };
  
  /**
   * Load table into the scene
   */
  const loadTable = async () => {
    if (!sceneRef.current) return false;
    
    try {
      await sceneRef.current.loadTable();
      setTableLoaded(true);
      setTableVisible(true);
      return true;
    } catch (error) {
      console.error('Error loading table:', error);
      return false;
    }
  };

  /**
   * Toggle table visibility
   */
  const toggleTable = (visible) => {
    if (!sceneRef.current || !tableLoaded) return;
    
    sceneRef.current.setTableVisible(visible);
    setTableVisible(visible);
  };
  
  // ✅ Expose methods to parent component (updated for RobotContext)
  React.useImperativeHandle(
    ref,
    () => ({
      // Multi-robot methods (delegated to RobotContext)
      loadRobot: (robotName, urdfPath, options) => loadRobot(robotName, urdfPath, options),
      getAllRobots: () => getAll3DRobots(),
      getRobot: (robotName) => get3DRobot(robotName),
      setRobotActive: (robotName, isActive) => {
        console.warn('setRobotActive not implemented - use setActiveRobotId from useRobot hook');
      },
      removeRobot: (robotName) => {
        console.warn('removeRobot not implemented - use unloadRobot from useRobot hook');
      },
      
      // Joint control methods (updated for unified context)
      setJointValue: (robotNameOrJointName, jointNameOrValue, value) => {
        // Handle both old API (jointName, value) and new API (robotName, jointName, value)
        if (value === undefined) {
          // Old API: use active robot
          if (activeRobotId) {
            return setJointValue(activeRobotId, robotNameOrJointName, jointNameOrValue);
          }
        } else {
          // New API: robot name specified
          return setJointValue(robotNameOrJointName, jointNameOrValue, value);
        }
      },
      updateJointValues: (robotNameOrValues, values) => {
        // Handle both old API (values) and new API (robotName, values)
        if (values === undefined) {
          // Old API: use active robot
          if (activeRobotId) {
            return setJointValues(activeRobotId, robotNameOrValues);
          }
        } else {
          // New API: robot name specified
          return setJointValues(robotNameOrValues, values);
        }
      },
      resetJoints: (robotName) => {
        // If no robot name specified, reset active robot
        const targetRobot = robotName || activeRobotId;
        if (targetRobot) {
          resetJoints(targetRobot);
        }
      },
      getJointValues: (robotName) => {
        // If no robot name specified, get active robot's values
        const targetRobot = robotName || activeRobotId;
        return targetRobot ? getJointValues(targetRobot) : {};
      },
      
      // Backward compatibility methods
      getCurrentRobot: () => activeRobotId ? get3DRobot(activeRobotId) : null,
      focusOnRobot: (robotName, forceRefocus = false) => {
        // Only focus if explicitly requested (forceRefocus = true)
        if (!forceRefocus) return;
        
        const robot = robotName 
          ? get3DRobot(robotName)
          : (activeRobotId ? get3DRobot(activeRobotId) : null);
        if (robot && sceneRef.current) {
          sceneRef.current.focusOnObject(robot);
        }
      },
      
      // General methods
      getRobotState: () => activeRobotId ? getJointValues(activeRobotId) : {},
      getRobotInfo: () => ({
        totalRobots: getAll3DRobots().size,
        activeRobots: activeRobotId ? [activeRobotId] : []
      }),
      getSceneSetup: () => sceneRef.current,
      
      // Table-related methods
      loadTable,
      toggleTable,
      isTableLoaded: () => tableLoaded,
      isTableVisible: () => tableVisible,
    }),
    [
      loadRobot, getAll3DRobots, get3DRobot, activeRobotId,
      setJointValue, setJointValues, getJointValues, resetJoints,
      tableLoaded, tableVisible
    ]
  );
  
  return (
    <div 
      ref={containerRef}
      style={{
        width: width || '100%',
        height: height || '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        backgroundColor: backgroundColor || DEFAULT_CONFIG.backgroundColor
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
      
      {(error || robotError) && (
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
          {error || robotError}
        </div>
      )}
    </div>
  );
};

export default React.forwardRef(URDFViewer);