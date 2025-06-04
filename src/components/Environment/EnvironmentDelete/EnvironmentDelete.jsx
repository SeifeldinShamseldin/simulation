import React, { useState } from 'react';
import { createPortal } from 'react-dom';

const EnvironmentDelete = ({ items, onComplete }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    
    try {
      for (const item of items) {
        if (item.type === 'object') {
          await fetch('/api/environment/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: item.path })
          });
        } else if (item.type === 'category') {
          await fetch(`/api/environment/category/${item.id}`, {
            method: 'DELETE'
          });
        }
      }
      
      if (onComplete) onComplete();
      setShowConfirm(false);
    } catch (error) {
      console.error('Error deleting items:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="controls-btn controls-btn-danger controls-btn-sm"
      >
        Delete ({items.length})
      </button>

      {showConfirm && createPortal(
        <div className="controls-modal-overlay">
          <div className="controls-modal">
            <div className="controls-modal-header">
              <h2 className="controls-modal-title">Confirm Delete</h2>
              <button
                className="controls-close"
                onClick={() => setShowConfirm(false)}
              >
                ×
              </button>
            </div>
            
            <div className="controls-modal-body">
              <p>Are you sure you want to delete {items.length} item(s)?</p>
              <ul>
                {items.map((item, index) => (
                  <li key={index}>{item.name}</li>
                ))}
              </ul>
            </div>
            
            <div className="controls-modal-footer">
              <button
                className="controls-btn controls-btn-secondary"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="controls-btn controls-btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default EnvironmentDelete; 