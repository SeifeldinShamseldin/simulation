// src/components/Environment/SpawnedObjects/SpawnedObjects.jsx
import React from 'react';
import {
  useEnvironmentObjects,
  useEnvironmentHumans
} from '../../../contexts/hooks/useEnvironment';
import humanManager from '../Human/HumanController';

const SpawnedObjects = ({ 
  viewerRef, 
  expandedObjects, 
  setExpandedObjects,
  rotationAxis,
  setRotationAxis
}) => {
  const { 
    objects: loadedObjects, 
    updateObject, 
    removeObject, 
    clearAll 
  } = useEnvironmentObjects();
  
  const { 
    humans: spawnedHumans, 
    moveHuman: handleMoveHuman, 
    positions: humanPositions 
  } = useEnvironmentHumans();

  const toggleObjectExpanded = (instanceId) => {
    setExpandedObjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(instanceId)) {
        newSet.delete(instanceId);
      } else {
        newSet.add(instanceId);
      }
      return newSet;
    });
  };

  const rotateObject = (instanceId, degrees) => {
    if (!viewerRef?.current) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    const object = sceneSetup.environmentObjects.get(instanceId);
    if (!object) return;
    
    const radians = degrees * Math.PI / 180;
    const newRotation = { x: 0, y: 0, z: 0 };
    
    newRotation.x = object.rotation.x;
    newRotation.y = object.rotation.y;
    newRotation.z = object.rotation.z;
    
    newRotation[rotationAxis] = radians;
    
    updateObject(instanceId, { rotation: newRotation });
  };

  if (loadedObjects.length === 0) return null;
  
  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h3 style={{ margin: 0 }}>Spawned Objects ({loadedObjects.length})</h3>
        <button
          onClick={clearAll}
          className="controls-btn controls-btn-danger controls-btn-sm"
        >
          Clear All
        </button>
      </div>
      
      <div className="controls-card-body">
        {loadedObjects.map(obj => {
          const isExpanded = expandedObjects.has(obj.instanceId);
          const objectData = viewerRef.current?.getSceneSetup()?.environmentObjects.get(obj.instanceId);
          
          const isHuman = obj.category === 'human' || 
                         obj.path?.toLowerCase()?.includes('/human/') ||
                         obj.name?.toLowerCase()?.includes('soldier') ||
                         obj.name?.toLowerCase()?.includes('human');
          
          return (
            <div key={obj.instanceId} className="controls-card controls-mb-3">
              <div 
                className="controls-card-header"
                onClick={() => toggleObjectExpanded(obj.instanceId)}
                style={{ cursor: 'pointer' }}
              >
                <div className="controls-d-flex controls-justify-content-between controls-align-items-center">
                  <div>
                    <strong>{obj.name}</strong>
                    <div className="controls-text-muted controls-small">
                      {isHuman ? 
                        (() => {
                          const pos = humanPositions[obj.instanceId] || { x: 0, y: 0, z: 0 };
                          return `${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}`;
                        })() :
                        objectData ? `${objectData.position.x.toFixed(2)},${objectData.position.y.toFixed(2)},${objectData.position.z.toFixed(2)}` : 'Loading...'
                      }
                      {' • '}
                      {objectData ? `${(objectData.rotation.x * 180/Math.PI).toFixed(0)}°,${(objectData.rotation.y * 180/Math.PI).toFixed(0)}°,${(objectData.rotation.z * 180/Math.PI).toFixed(0)}°` : ''}
                      {' • '}
                      {objectData ? objectData.scale.x.toFixed(2) : '1.00'}
                    </div>
                  </div>
                  <div className="controls-d-flex controls-align-items-center controls-gap-2">
                    <label className="controls-form-check controls-mb-0">
                      <input
                        type="checkbox"
                        className="controls-form-check-input"
                        checked={objectData?.visible !== false}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateObject(obj.instanceId, { visible: e.target.checked });
                        }}
                      />
                      <span className="controls-form-check-label">👁️</span>
                    </label>
                    <span>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="controls-card-body">
                  <div className="controls-mb-3">
                    <label className="controls-form-label">Position</label>
                    <div className="controls-row">
                      {['x', 'y', 'z'].map(axis => (
                        <div key={axis} className="controls-col-4">
                          <div className="controls-input-group controls-input-group-sm">
                            <span className="controls-input-group-text">{axis.toUpperCase()}</span>
                            <input
                              key={`${obj.instanceId}_${axis}_${humanPositions[obj.instanceId]?.[axis] || 0}`}
                              type="number"
                              className="controls-form-control"
                              step="0.1"
                              defaultValue={(() => {
                                if (isHuman) {
                                  const pos = humanPositions[obj.instanceId] || { x: 0, y: 0, z: 0 };
                                  return pos[axis].toFixed(2);
                                }
                                return objectData ? objectData.position[axis].toFixed(2) : 0;
                              })()}
                              onChange={(e) => {
                                const value = e.target.value;
                                const numValue = parseFloat(value);
                                
                                if (isHuman) {
                                  const human = humanManager.getHuman(obj.instanceId);
                                  if (!human) return;
                                  
                                  const currentPos = human.getPosition();
                                  const pos = {
                                    x: currentPos.x,
                                    y: currentPos.y,
                                    z: currentPos.z
                                  };
                                  
                                  if (!isNaN(numValue)) {
                                    pos[axis] = numValue;
                                    updateObject(obj.instanceId, { position: pos });
                                  }
                                  return;
                                }
                                
                                const sceneSetup = viewerRef.current?.getSceneSetup();
                                if (!sceneSetup) return;
                                
                                const currentObj = sceneSetup.environmentObjects.get(obj.instanceId);
                                if (!currentObj) return;
                                
                                const pos = {
                                  x: currentObj.position.x,
                                  y: currentObj.position.y,
                                  z: currentObj.position.z
                                };
                                
                                if (!isNaN(numValue)) {
                                  pos[axis] = numValue;
                                  updateObject(obj.instanceId, { position: pos });
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="controls-mb-3">
                    <label className="controls-form-label">Scale</label>
                    <div className="controls-row">
                      {['x', 'y', 'z'].map(axis => (
                        <div key={axis} className="controls-col-4">
                          <div className="controls-input-group controls-input-group-sm">
                            <span className="controls-input-group-text">{axis.toUpperCase()}</span>
                            <input
                              type="number"
                              className="controls-form-control"
                              step="0.1"
                              min="0.1"
                              defaultValue={objectData?.scale[axis] || 1}
                              onChange={(e) => {
                                const scale = { ...objectData.scale };
                                scale[axis] = parseFloat(e.target.value) || 1;
                                updateObject(obj.instanceId, { scale });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="controls-mb-3">
                    <label className="controls-form-label">Rotation</label>
                    <div className="controls-btn-group controls-btn-group-sm controls-mb-2">
                      {['x', 'y', 'z'].map(axis => (
                        <button
                          key={axis}
                          className={`controls-btn ${rotationAxis === axis ? 'controls-btn-primary' : 'controls-btn-outline-primary'}`}
                          onClick={() => setRotationAxis(axis)}
                        >
                          {axis.toUpperCase()} Axis
                        </button>
                      ))}
                    </div>
                    <div className="controls-btn-group controls-btn-group-sm controls-d-flex controls-flex-wrap controls-gap-1">
                      {[0, 45, 90, 135, 180, 225, 270, 315, 360].map(deg => (
                        <button
                          key={deg}
                          className="controls-btn controls-btn-outline-secondary"
                          onClick={() => rotateObject(obj.instanceId, deg)}
                          style={{
                            minWidth: '60px',
                            padding: '0.25rem 0.5rem'
                          }}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {isHuman && (
                    <button
                      className={`controls-btn ${spawnedHumans.find(h => h.id === obj.instanceId)?.isActive ? 'controls-btn-danger' : 'controls-btn-success'} controls-btn-block controls-mb-3`}
                      onClick={() => handleMoveHuman(obj.instanceId)}
                    >
                      {spawnedHumans.find(h => h.id === obj.instanceId)?.isActive ? '🛑 Stop Human' : '🚶 Move Human'}
                    </button>
                  )}
                  
                  <button
                    className="controls-btn controls-btn-danger controls-btn-sm controls-w-100"
                    onClick={() => removeObject(obj.instanceId)}
                  >
                    Remove Object
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SpawnedObjects;