// src/contexts/hooks/useRobotControl.js - SIMPLIFIED FACADE
import { useRobotSelection } from './useRobot';
import { useJoints } from './useJoints';
import { useTCP } from './useTCP';

/**
 * Facade hook that combines robot-related functionality
 * NO DUPLICATE LOGIC - just combines other hooks
 */
export const useRobotControl = () => {
  const { activeId: activeRobotId, activeRobot } = useRobotSelection();
  const joints = useJoints(); // Uses activeRobotId automatically
  const tcp = useTCP(); // Uses activeRobotId automatically
  
  return {
    // Robot state
    activeRobotId,
    robot: activeRobot,
    isReady: !!activeRobotId && !!activeRobot,
    
    // Joint control (from useJoints)
    setJointValue: joints.setJointValue,
    setJointValues: joints.setJointValues,
    getJointValues: joints.getJointValues,
    resetJoints: joints.resetJoints,
    
    // TCP awareness (from useTCP)
    currentEndEffectorPoint: tcp.currentEndEffectorPoint,
    hasValidEndEffector: tcp.hasValidEndEffector,
    isUsingTCP: tcp.isUsingTCP,
    isUsingRobotEndEffector: tcp.isUsingRobotEndEffector,
    
    // Combined info
    getEndEffectorInfo: tcp.getEndEffectorInfo,
    getEndEffectorType: tcp.getEndEffectorType,
    
    // Animation state
    isAnimating: joints.isAnimating,
    animationProgress: joints.animationProgress
  };
};