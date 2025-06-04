import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';
import EnvironmentDelete from '../EnvironmentDelete/EnvironmentDelete';
import AddEnvironment from '../AddEnvironment/AddEnvironment';

const EnvironmentCategories = ({ viewerRef }) => {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(new Set());

  useEffect(() => {
    scanEnvironment();
    
    // Listen for refresh events
    const unsubscribe = EventBus.on('environment:refresh', scanEnvironment);
    return () => unsubscribe();
  }, []);

  const scanEnvironment = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/environment/scan');
      const result = await response.json();
      
      if (result.success) {
        setCategories(result.categories);
      } else {
        setError('Failed to scan environment');
      }
    } catch (err) {
      setError('Error scanning environment');
    } finally {
      setIsLoading(false);
    }
  };

  const selectCategory = (category) => {
    EventBus.emit('environment:category-selected', category);
  };

  const toggleSelection = (categoryId) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedCategories(newSelected);
  };

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">Environment Categories</h3>
        <div className="controls-d-flex controls-gap-2">
          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={`controls-btn controls-btn-sm ${isSelectionMode ? 'controls-btn-warning' : 'controls-btn-outline-secondary'}`}
          >
            {isSelectionMode ? 'Cancel' : 'Select'}
          </button>
          {isSelectionMode && selectedCategories.size > 0 && (
            <EnvironmentDelete 
              items={Array.from(selectedCategories).map(id => ({
                type: 'category',
                id,
                name: categories.find(c => c.id === id)?.name
              }))}
              onComplete={() => {
                setSelectedCategories(new Set());
                setIsSelectionMode(false);
                scanEnvironment();
              }}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="controls-alert controls-alert-danger">
          {error}
        </div>
      )}

      <div className="controls-grid controls-grid-cols-2 controls-gap-3">
        {categories.map(cat => (
          <div
            key={cat.id}
            className={`controls-card ${selectedCategories.has(cat.id) ? 'controls-border-primary' : ''}`}
            onClick={() => {
              if (isSelectionMode) {
                toggleSelection(cat.id);
              } else {
                selectCategory(cat);
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="controls-card-body controls-text-center">
              {isSelectionMode && (
                <div className="controls-position-absolute controls-top-0 controls-start-0 controls-p-2">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(cat.id)}
                    onChange={() => {}}
                    className="controls-form-checkbox"
                  />
                </div>
              )}
              <div className="controls-card-icon">{cat.icon}</div>
              <h5 className="controls-card-title">{cat.name}</h5>
              <p className="controls-text-muted">{cat.objects.length} items</p>
            </div>
          </div>
        ))}
        
        {!isSelectionMode && (
          <div
            className="controls-card controls-border-dashed"
            onClick={() => setShowAddModal(true)}
            style={{ cursor: 'pointer', borderStyle: 'dashed' }}
          >
            <div className="controls-card-body controls-text-center">
              <div className="controls-card-icon controls-text-primary">+</div>
              <h5 className="controls-card-title">Add New</h5>
              <p className="controls-text-muted">Object</p>
            </div>
          </div>
        )}
      </div>

      <AddEnvironment
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          scanEnvironment();
        }}
        existingCategories={categories}
      />
    </div>
  );
};

export default EnvironmentCategories; 