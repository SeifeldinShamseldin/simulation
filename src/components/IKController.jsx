import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../hooks/useRobotControl';
import { useIK } from '../hooks/useIK';

const IKController = () => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  const {
    currentPosition,
    currentOrientation,
    currentEulerAngles,
    targetPosition,
    isAnimating,
    solverStatus,
    currentSolver,
    availableSolvers,
    setTargetPosition,
    setCurrentSolver,
    executeIK,
    stopAnimation,
    configureSolver,
    getSolverSettings
  } = useIK();

  const [showSettings, setShowSettings] = useState(false);
  const [solverSettings, setSolverSettings] = useState({});
  const [targetOrientation, setTargetOrientation] = useState({ roll: 0, pitch: 0, yaw: 0 });
  const [orientationInitialized, setOrientationInitialized] = useState(false);

  // Debug logging
  useEffect(() => {
    console.log('[IKController] State:', {
      activeRobotId,
      hasRobot: !!robot,
      isReady,
      currentPosition,
      targetPosition
    });
  }, [activeRobotId, robot, isReady, currentPosition, targetPosition]);

  return (
    <div>
      {/* Rest of the component code */}
    </div>
  );
};

export default IKController; 