import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';

const HumanTracker = () => {
  const [humanPosition, setHumanPosition] = useState({ x: 0, y: 0, z: 0 });
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);

  useEffect(() => {
    const unsubscribeSpawned = EventBus.on('human:spawned', (data) => {
      setSpawnedHumans(prev => [...prev, data]);
      if (data.isActive) {
        setSelectedHuman(data.id);
      }
    });
    
    const unsubscribeRemoved = EventBus.on('human:removed', (data) => {
      setSpawnedHumans(prev => prev.filter(h => h.id !== data.id));
      if (selectedHuman === data.id) {
        setSelectedHuman(null);
      }
    });
    
    const unsubscribeSelected = EventBus.on('human:selected', (data) => {
      setSelectedHuman(data.id);
    });
    
    const unsubscribePosition = EventBus.on('human:position-update', (data) => {
      if (data.position) {
        setHumanPosition({
          x: data.position[0],
          y: data.position[1],
          z: data.position[2]
        });
      }
    });
    
    return () => {
      unsubscribeSpawned();
      unsubscribeRemoved();
      unsubscribeSelected();
      unsubscribePosition();
    };
  }, [selectedHuman]);

  return null; // This component doesn't render anything, it just tracks state
};

export default HumanTracker; 