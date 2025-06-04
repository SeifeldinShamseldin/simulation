import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';
import EnvironmentDelete from '../EnvironmentDelete/EnvironmentDelete';

const EnvironmentObjects = ({ viewerRef }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  useEffect(() => {
    const unsubscribe = EventBus.on('environment:category-selected', (category) => {
      setSelectedCategory(category);
      setSelectedItems(new Set());
      setIsSelectionMode(false);
    });
    
    return () => unsubscribe();
  }, []);

  const loadObject = async (object) => {
    if (!viewerRef?.current) return;
    
    setIsLoading(true);
    try {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) throw new Error('Scene not initialized');
      
      const instanceId = `${object.id}_${Date.now()}`;
      
      await sceneSetup.loadEnvironmentObject({
        ...object,
        id: instanceId
      });
      
      EventBus.emit('environment:object-spawned', {
        instanceId,
        object
      });
      
    } catch (error) {
      console.error('Error loading object:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (objectPath) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(objectPath)) {
      newSelected.delete(objectPath);
    } else {
      newSelected.add(objectPath);
    }
    setSelectedItems(newSelected);
  };

  if (!selectedCategory) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Objects</h3>
        <p className="controls-text-muted controls-text-center">
          Select a category to view objects
        </p>
      </div>
    );
  }

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">
          {selectedCategory.icon} {selectedCategory.name} Objects
        </h3>
        <div className="controls-d-flex controls-gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className="controls-btn controls-btn-sm controls-btn-outline-secondary"
          >
            Back
          </button>
          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={`controls-btn controls-btn-sm ${isSelectionMode ? 'controls-btn-warning' : 'controls-btn-outline-secondary'}`}
          >
            {isSelectionMode ? 'Cancel' : 'Select'}
          </button>
          {isSelectionMode && selectedItems.size > 0 && (
            <EnvironmentDelete 
              items={Array.from(selectedItems).map(path => ({
                type: 'object',
                path,
                name: selectedCategory.objects.find(o => o.path === path)?.name
              }))}
              onComplete={() => {
                setSelectedItems(new Set());
                setIsSelectionMode(false);
                EventBus.emit('environment:refresh');
              }}
            />
          )}
        </div>
      </div>

      <div className="controls-grid controls-grid-cols-2 controls-gap-3">
        {selectedCategory.objects.map(obj => (
          <div
            key={obj.id}
            className={`controls-card ${selectedItems.has(obj.path) ? 'controls-border-primary' : ''}`}
            onClick={() => {
              if (isSelectionMode) {
                toggleSelection(obj.path);
              }
            }}
          >
            <div className="controls-card-body">
              {isSelectionMode && (
                <div className="controls-position-absolute controls-top-0 controls-start-0 controls-p-2">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(obj.path)}
                    onChange={() => {}}
                    className="controls-form-checkbox"
                  />
                </div>
              )}
              <h5 className="controls-card-title">{obj.name}</h5>
              <p className="controls-text-muted controls-small">
                {obj.type.toUpperCase()} • {(obj.size / 1024).toFixed(1)}KB
              </p>
              {!isSelectionMode && (
                <button
                  onClick={() => loadObject(obj)}
                  disabled={isLoading}
                  className="controls-btn controls-btn-success controls-btn-sm controls-btn-block"
                >
                  {isLoading ? 'Loading...' : '+ Add to Scene'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EnvironmentObjects; 