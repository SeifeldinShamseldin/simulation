import { useEffect } from 'react';
import { useIK } from './useIK';
import TrajectoryAPI from '../../core/Trajectory/TrajectoryAPI';

// Singleton instance
const trajectoryAPI = new TrajectoryAPI();

export const useTrajectoryAPI = () => {
  const ikContext = useIK();

  useEffect(() => {
    // Connect IK context to TrajectoryAPI
    trajectoryAPI.setIKContext(ikContext);
  }, [ikContext]);

  return trajectoryAPI;
}; 