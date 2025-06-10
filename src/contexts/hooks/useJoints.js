// src/contexts/hooks/useJoints.js - Simple data transfer hook
import { useContext } from 'react';
import JointContext from '../JointContext';
import { useRobotSelection } from './useRobot';

/**
 * Hook to use the joint context
 * @returns {Object} Joint context value
 * @throws {Error} If used outside of JointProvider
 */
export const useJoints = () => {
  const context = useContext(JointContext);
  if (!context) {
    throw new Error('useJoints must be used within JointProvider');
  }
  return context;
};

export default useJoints;