import { useEffect } from 'react';
import { usePlaybackTrajectoryLine } from '../../../contexts/hooks/usePlaybackTrajectoryLine';
import { useRobotSelection } from '../../../contexts/hooks/useRobotManager';

const TrajectoryLineVisualizer = () => {
  const { activeId } = useRobotSelection();
  
  // usePlaybackTrajectoryLine doesn't need parameters as it handles everything internally
  usePlaybackTrajectoryLine();

  return null; // This component doesn't render anything in the DOM
};

export default TrajectoryLineVisualizer; 