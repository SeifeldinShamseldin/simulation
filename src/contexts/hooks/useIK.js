// src/contexts/hooks/useIK.js
import { useContext, useCallback } from 'react';
import IKContext from '../IKContext';

export const useIK = () => {
  const context = useContext(IKContext);
  if (!context) {
    throw new Error('useIK must be used within IKProvider');
  }
  
  const {
    currentPosition,
    targetPosition,
    isAnimating,
    solverStatus,
    setTargetPosition,
    executeIK,
    stopAnimation
  } = context;

  // Convenience methods
  const moveToTarget = useCallback(async (animate = true) => {
    return executeIK(targetPosition, { animate });
  }, [targetPosition, executeIK]);

  const moveRelative = useCallback((axis, delta) => {
    setTargetPosition(prev => ({
      ...prev,
      [axis]: prev[axis] + delta
    }));
  }, [setTargetPosition]);

  const syncTargetToCurrent = useCallback(() => {
    setTargetPosition(currentPosition);
  }, [currentPosition, setTargetPosition]);

  return {
    // State
    currentPosition,
    targetPosition,
    isAnimating,
    solverStatus,
    
    // Methods
    setTargetPosition,
    moveToTarget,
    moveRelative,
    syncTargetToCurrent,
    stopAnimation,
    
    // Direct access to executeIK for custom targets
    executeIK
  };
};

export default useIK; 