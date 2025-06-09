// src/components/Environment/Grid/Grid.jsx  
import React from 'react';
import { createPortal } from 'react-dom';

const Grid = ({ 
  categories, 
  selectedCategory,
  isSelectionMode,
  selectedCategories,
  onCategoryClick,
  onCategorySelect,
  onAddNew,
  currentView,
  selectedItems,
  onItemClick,
  onItemSelect,
  onBackClick,
  isLoading
}) => {
  
  // Render category squares
  if (currentView === 'categories' || !selectedCategory) {
    return (
      <div className="controls-grid controls-grid-cols-2 controls-gap-3">
        {/* Existing categories */}
        {categories.map(cat => (
          <div
            key={cat.id}
            className={`controls-card ${selectedCategories?.has(cat.id) ? 'controls-border-primary' : ''}`}
            onClick={() => {
              if (isSelectionMode) {
                onCategorySelect(cat.id);
              } else {
                onCategoryClick(cat);
              }
            }}
            style={{
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!isSelectionMode) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '';
            }}
          >
            <div className="controls-card-body controls-text-center controls-p-4">
              {/* Selection checkbox */}
              {isSelectionMode && (
                <div
                  className="controls-position-absolute"
                  style={{
                    top: '0.5rem',
                    left: '0.5rem',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: '2px solid #007bff',
                    background: selectedCategories?.has(cat.id) ? '#007bff' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  {selectedCategories?.has(cat.id) && '✓'}
                </div>
              )}
              
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{cat.icon}</div>
              <h5 className="controls-h5 controls-mb-1">{cat.name}</h5>
              <small className="controls-text-muted">{cat.objects.length} items</small>
            </div>
          </div>
        ))}
        
        {/* Add New Object Card */}
        {!isSelectionMode && (
          <div
            className="controls-card"
            onClick={onAddNew}
            style={{
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderWidth: '2px',
              borderColor: '#00a99d',
              background: '#fff',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#008077';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              e.currentTarget.style.background = '#f0fffe';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#00a99d';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '';
              e.currentTarget.style.background = '#fff';
            }}
          >
            <div className="controls-card-body controls-text-center controls-p-4">
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem', color: '#00a99d' }}>+</div>
              <h5 className="controls-h5 controls-mb-1">Add New</h5>
              <small className="controls-text-muted">Object</small>
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // Render objects in selected category
  return (
    <div>
      <button
        onClick={onBackClick}
        className="controls-btn controls-btn-link controls-p-0 controls-mb-3"
        style={{
          textDecoration: 'none',
          color: '#666',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        ← Back to Categories
      </button>
      
      <h4 className="controls-h4 controls-mb-3">
        {selectedCategory.icon} {selectedCategory.name}
      </h4>
      
      <div className="controls-grid controls-grid-cols-2 controls-gap-3">
        {selectedCategory.objects.map(obj => (
          <div
            key={obj.id}
            className={`controls-card ${selectedItems?.has(obj.path) ? 'controls-border-primary' : ''}`}
            onClick={() => {
              if (isSelectionMode) {
                onItemSelect(obj.path);
              }
            }}
            style={{
              position: 'relative',
              cursor: isSelectionMode ? 'pointer' : 'default'
            }}
          >
            <div className="controls-card-body">
              {/* Selection checkbox */}
              {isSelectionMode && (
                <div
                  className="controls-position-absolute"
                  style={{
                    top: '0.5rem',
                    left: '0.5rem',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: '2px solid #007bff',
                    background: selectedItems?.has(obj.path) ? '#007bff' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  {selectedItems?.has(obj.path) && '✓'}
                </div>
              )}
              
              <h5 className="controls-h5 controls-mb-2" style={{
                paddingLeft: isSelectionMode ? '2rem' : '0'
              }}>{obj.name}</h5>
              <p className="controls-text-muted controls-small controls-mb-3">
                {obj.type.toUpperCase()} • {(obj.size / 1024).toFixed(1)}KB
              </p>
              
              {!isSelectionMode && (
                <button
                  onClick={() => onItemClick(obj)}
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

export default Grid;