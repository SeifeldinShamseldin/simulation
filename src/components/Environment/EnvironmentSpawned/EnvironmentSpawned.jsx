import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';
import ObjectControls from './ObjectControls';

const EnvironmentSpawned = ({ viewerRef }) => {
  const [spawnedObjects, setSpawnedObjects] = useState([]);
  const [expandedObjects, setExpandedObjects] = useState(new Set());

  useEffect(() => {
    const handleSpawned = (data) => {
      setSpawnedObjects(prev => [...prev, data]);
    };

    const handleRemoved = (data) => {
      setSpawnedObjects(prev => prev.filter(obj => obj.instanceId !== data.instanceId));
    };

    const unsubscribeSpawned = EventBus.on('environment:object-spawned', handleSpawned);
    const unsubscribeRemoved = EventBus.on('environment:object-removed', handleRemoved);

    return () => {
      unsubscribeSpawned();
      unsubscribeRemoved();
    };
  }, []);

  const toggleExpanded = (instanceId) => {
    const newExpanded = new Set(expandedObjects);
    if (newExpanded.has(instanceId)) {
      newExpanded.delete(instanceId);
    } else {
      newExpanded.add(instanceId);
    }
    setExpandedObjects(newExpanded);
  };

  const removeObject = (instanceId) => {
    if (!viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (sceneSetup) {
      sceneSetup.removeEnvironmentObject(instanceId);
    }
    
    EventBus.emit('environment:object-removed', { instanceId });
  };

  const clearAll = () => {
    spawnedObjects.forEach(obj => removeObject(obj.instanceId));
  };

  if (spawnedObjects.length === 0) {
    return null;
  }

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">
          Spawned Objects ({spawnedObjects.length})
        </h3>
        <button
          onClick={clearAll}
          className="controls-btn controls-btn-danger controls-btn-sm"
        >
          Clear All
        </button>
      </div>

      <div className="controls-list">
        {spawnedObjects.map(({ instanceId, object }) => (
          <div key={instanceId} className="controls-list-item">
            <div className="controls-list-item-content">
              <div 
                onClick={() => toggleExpanded(instanceId)}
                style={{ cursor: 'pointer' }}
              >
                <h5 className="controls-list-item-title">
                  {object.name}
                  <span className="controls-ml-2">
                    {expandedObjects.has(instanceId) ? '▼' : '▶'}
                  </span>
                </h5>
              </div>
              
              {expandedObjects.has(instanceId) && (
                <ObjectControls
                  instanceId={instanceId}
                  viewerRef={viewerRef}
                  onRemove={() => removeObject(instanceId)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EnvironmentSpawned; 