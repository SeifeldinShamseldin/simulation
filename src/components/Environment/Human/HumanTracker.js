import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';

const HumanTracker = () => {
  const [humanPosition, setHumanPosition] = useState({ x: 0, y: 0, z: 0 });
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);

  useEffect(() => {
    // Remove all unused EventBus.on calls.
  }, [selectedHuman]);

  return null; // This component doesn't render anything, it just tracks state
};

export default HumanTracker; 