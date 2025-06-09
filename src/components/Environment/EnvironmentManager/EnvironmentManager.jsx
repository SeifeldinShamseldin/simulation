// src/components/Environment/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Grid from '../Grid/Grid';
import AddEnvironment from '../AddEnvironment/AddEnvironment';
import SpawnedObjects from '../SpawnedObjects/SpawnedObjects';
import {
  useEnvironment,
  useEnvironmentView,
  useEnvironmentObjects,
  useEnvironmentHumans
} from '../../../contexts/hooks/useEnvironment';

const EnvironmentManager = ({ viewerRef, isPanel = false, onClose }) => {
  const {
    // State
    categories,
    isLoading: contextLoading,
    error,
    successMessage,
    
    // Environment operations
    scanEnvironment,
    loadObject,
    updateObject,
    deleteObject,
    deleteCategory,
    
    // Utils
    clearError,
    clearSuccess
  } = useEnvironment();

  const { currentView, selectedCategory, selectCategory, goBack } = useEnvironmentView();
  const { objects: loadedObjects } = useEnvironmentObjects();
  const { humans: spawnedHumans } = useEnvironmentHumans();
  
  // Local UI states
  const [expandedObjects, setExpandedObjects] = useState(new Set());
  const [rotationAxis, setRotationAxis] = useState('y');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState({ items: [], callback: null });

  // Initialize on mount
  useEffect(() => {
    scanEnvironment();
  }, [scanEnvironment]);

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedItems(new Set());
    setSelectedCategories(new Set());
  };

  const toggleItemSelection = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleCategorySelection = (categoryId) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedCategories(newSelected);
  };

  const deleteSelectedItems = async () => {
    const totalItems = selectedItems.size + selectedCategories.size;
    if (totalItems === 0) return;

    const itemsList = [];
    
    for (const itemPath of selectedItems) {
      const obj = selectedCategory.objects.find(o => o.path === itemPath);
      if (obj) {
        itemsList.push({ name: obj.name, type: 'object', path: obj.path });
      }
    }
    
    for (const categoryId of selectedCategories) {
      const cat = categories.find(c => c.id === categoryId);
      if (cat) {
        itemsList.push({ 
          name: cat.name, 
          type: 'category', 
          id: cat.id,
          count: cat.objects.length 
        });
      }
    }

    setDeleteConfirmData({
      items: itemsList,
      callback: async () => {
        try {
          for (const item of itemsList) {
            if (item.type === 'object') {
              await deleteObject(item.path, item.name);
            } else if (item.type === 'category') {
              await deleteCategory(item.id, item.name);
            }
          }

          setIsSelectionMode(false);
          setSelectedItems(new Set());
          setSelectedCategories(new Set());
          
          await scanEnvironment();
        } catch (error) {
          console.error('Error deleting selected items:', error);
        }
      }
    });
    setShowDeleteConfirm(true);
  };

  const DeleteConfirmModal = () => {
    if (!showDeleteConfirm) return null;
    
    const itemCount = deleteConfirmData.items.length;
    
    return createPortal(
      <div className="controls-modal-overlay">
        <div className="controls-modal" style={{ maxWidth: '500px', minHeight: 'auto' }}>
          <div className="controls-modal-header">
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Confirm Delete</h2>
          </div>
          
          <div className="controls-modal-body" style={{ padding: '2rem' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>
              Are you sure you want to delete {itemCount} selected item{itemCount > 1 ? 's' : ''}?
            </p>
            <div style={{ 
              background: '#f8f9fa', 
              padding: '1rem', 
              borderRadius: '4px',
              marginBottom: '1.5rem',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <strong>Items to delete:</strong>
              <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
                {deleteConfirmData.items.map((item, index) => (
                  <li key={index} style={{ marginBottom: '0.25rem' }}>
                    {item.name} {item.type === 'category' && `(${item.count} objects)`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="controls-modal-footer" style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '1rem',
            padding: '1.5rem 2rem',
            borderTop: '1px solid #e0e0e0'
          }}>
            <button 
              className="controls-btn controls-btn-secondary"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmData({ items: [], callback: null });
              }}
            >
              No, Cancel
            </button>
            <button 
              className="controls-btn controls-btn-danger"
              onClick={() => {
                if (deleteConfirmData.callback) {
                  deleteConfirmData.callback();
                }
                setShowDeleteConfirm(false);
                setDeleteConfirmData({ items: [], callback: null });
              }}
            >
              Yes, Delete
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #dee2e6'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Environment Objects</h2>
          <button
            onClick={toggleSelectionMode}
            className="controls-btn controls-btn-sm controls-btn-outline-primary"
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.875rem'
            }}
          >
            {isSelectionMode ? 'Cancel' : 'Select'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isSelectionMode && (selectedItems.size > 0 || selectedCategories.size > 0) && (
            <button
              onClick={deleteSelectedItems}
              className="controls-btn controls-btn-danger controls-btn-sm"
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.875rem'
              }}
            >
              Delete ({selectedItems.size + selectedCategories.size})
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.8rem',
              cursor: 'pointer',
              color: '#6c757d',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              transition: 'all 0.2s ease',
              lineHeight: 1
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#e9ecef';
              e.target.style.color = '#495057';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'none';
              e.target.style.color = '#6c757d';
            }}
          >
            ×
          </button>
        </div>
      </div>
      
      {/* Messages */}
      {error && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#ffebee',
          color: '#c62828',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}
      
      {successMessage && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#e8f5e9',
          color: '#2e7d32',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {successMessage}
        </div>
      )}
      
      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Grid
          categories={categories}
          selectedCategory={selectedCategory}
          isSelectionMode={isSelectionMode}
          selectedCategories={selectedCategories}
          onCategoryClick={selectCategory}
          onCategorySelect={toggleCategorySelection}
          onAddNew={() => setShowAddModal(true)}
          currentView={currentView}
          selectedItems={selectedItems}
          onItemClick={loadObject}
          onItemSelect={toggleItemSelection}
          onBackClick={goBack}
          isLoading={contextLoading}
        />
        
        <SpawnedObjects 
          viewerRef={viewerRef}
          expandedObjects={expandedObjects}
          setExpandedObjects={setExpandedObjects}
          rotationAxis={rotationAxis}
          setRotationAxis={setRotationAxis}
        />
      </div>
      
      {/* Refresh button */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e0e0e0'
      }}>
        <button
          onClick={scanEnvironment}
          disabled={contextLoading}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: contextLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!contextLoading) {
              e.currentTarget.style.background = '#e0e0e0';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f5f5f5';
          }}
        >
          {contextLoading ? '⏳' : '🔄'} Refresh Objects
        </button>
      </div>

      {/* Add Environment Modal */}
      <AddEnvironment
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(result) => {
          setShowAddModal(false);
          scanEnvironment();
        }}
        existingCategories={categories}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal />
    </div>
  );
};

export default EnvironmentManager;