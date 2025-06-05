// src/components/Environment/DeleteManager/DeleteManager.jsx
import React from 'react';
import { createPortal } from 'react-dom';

const DeleteManager = ({
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteConfirmData,
  setDeleteConfirmData,
  categories,
  setCategories,
  selectedCategory,
  setSelectedCategory,
  setCurrentView
}) => {
  
  const deleteObject = async (objectPath, objectName) => {
    try {
      const response = await fetch('/api/environment/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: objectPath })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update UI
        return { success: true, message: `${objectName} deleted successfully` };
      } else {
        throw new Error(result.message || 'Failed to delete object');
      }
    } catch (error) {
      throw error;
    }
  };

  const deleteCategory = async (categoryId, categoryName) => {
    try {
      const response = await fetch(`/api/environment/category/${categoryId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCurrentView('categories');
        setSelectedCategory(null);
        return { success: true, message: `Category "${categoryName}" deleted successfully` };
      } else {
        throw new Error(result.message || 'Failed to delete category');
      }
    } catch (error) {
      throw error;
    }
  };

  const DeleteConfirmModal = () => {
    if (!showDeleteConfirm) return null;
    
    const itemCount = deleteConfirmData.items.length;
    
    return createPortal(
      <div className="controls-modal-overlay">
        <div className="controls-modal" style={{ maxWidth: '500px' }}>
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

  // Export the functions for use in EnvironmentManager
  React.useEffect(() => {
    window.environmentDeleteAPI = {
      deleteObject,
      deleteCategory
    };
  }, []);

  return <DeleteConfirmModal />;
};

export default DeleteManager; 