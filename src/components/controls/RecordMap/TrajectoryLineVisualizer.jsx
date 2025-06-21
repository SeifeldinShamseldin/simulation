import { useEffect } from 'react';
import { useRobotSelection } from '../../../contexts/hooks/useRobotManager';

const TrajectoryLineVisualizer = () => {
  const { activeId } = useRobotSelection();
  // This component doesn't render anything in the DOM
  return null;
};

export default TrajectoryLineVisualizer; 