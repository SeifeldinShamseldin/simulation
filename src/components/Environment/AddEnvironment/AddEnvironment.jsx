// src/components/Environment/AddEnvironment/AddEnvironment.jsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const AddEnvironment = ({ isOpen, onClose, onSuccess, existingCategories = [] }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    category: '',
    isNewCategory: false,
    objectName: '',
    description: ''
  });
  const [file, setFile] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setFormData({
        category: '',
        isNewCategory: false,
        objectName: '',
        description: ''
      });
      setFile(null);
      setSelectedCategory('');
      setError(null);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 1:
        return formData.isNewCategory ? !!formData.category : !!selectedCategory;
      case 2:
        return !!formData.objectName;
      case 3:
        return !!file;
      default:
        return false;
    }
  };

  const handleAddObject = async () => {
    setIsUploading(true);
    setError(null);

    try {
      const data = new FormData();
      data.append('category', formData.isNewCategory ? formData.category : selectedCategory);
      data.append('objectName', formData.objectName);
      data.append('description', formData.description);
      data.append('modelFile', file);

      const response = await fetch('/api/environment/add', {
        method: 'POST',
        body: data
      });

      const result = await response.json();

      if (result.success) {
        onSuccess(result);
        onClose();
      } else {
        setError(result.message || 'Upload failed');
      }
    } catch (error) {
      setError('Error uploading file: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="controls-modal-overlay">
      <div className="controls-modal" style={{ maxWidth: '700px', minHeight: '500px' }}>
        <div className="controls-modal-header">
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Add Environment Object</h2>
          <button 
            className="controls-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '2rem',
              cursor: 'pointer',
              color: '#999',
              padding: '0',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'all 0.2s'
            }}
          >
            ×
          </button>
        </div>
        
        {/* Step Indicators */}
        <div style={{
          display: 'flex',
          padding: '1.5rem 2rem',
          borderBottom: '1px solid #e0e0e0',
          background: '#f8f9fa'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            color: currentStep >= 1 ? '#1976d2' : '#999',
            marginRight: '3rem'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: currentStep >= 1 ? '#1976d2' : '#e0e0e0',
              color: currentStep >= 1 ? '#fff' : '#999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '600',
              marginRight: '0.5rem'
            }}>1</span>
            <span style={{ fontWeight: '500' }}>Select Category</span>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            color: currentStep >= 2 ? '#1976d2' : '#999',
            marginRight: '3rem'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: currentStep >= 2 ? '#1976d2' : '#e0e0e0',
              color: currentStep >= 2 ? '#fff' : '#999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '600',
              marginRight: '0.5rem'
            }}>2</span>
            <span style={{ fontWeight: '500' }}>Object Details</span>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            color: currentStep >= 3 ? '#1976d2' : '#999'
          }}>
            <span style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: currentStep >= 3 ? '#1976d2' : '#e0e0e0',
              color: currentStep >= 3 ? '#fff' : '#999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '600',
              marginRight: '0.5rem'
            }}>3</span>
            <span style={{ fontWeight: '500' }}>Upload File</span>
          </div>
        </div>
        
        <div className="controls-modal-body" style={{ padding: '2rem', minHeight: '300px' }}>
          {error && (
            <div className="controls-alert controls-alert-danger controls-mb-3">
              {error}
            </div>
          )}

          {/* Step 1: Category Selection */}
          {currentStep === 1 && (
            <div>
              <h3 style={{ marginBottom: '1.5rem' }}>Select Category</h3>
              
              <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1.5rem',
                marginBottom: '1rem',
                background: !formData.isNewCategory ? '#e3f2fd' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => setFormData({...formData, isNewCategory: false})}>
                <input
                  type="radio"
                  id="existing-cat"
                  name="categoryType"
                  checked={!formData.isNewCategory}
                  onChange={() => setFormData({...formData, isNewCategory: false})}
                  style={{ marginRight: '0.5rem' }}
                />
                <label htmlFor="existing-cat" style={{ cursor: 'pointer' }}>
                  <strong>Existing Category</strong>
                  <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                    Add to an existing category
                  </p>
                </label>
              </div>
              
              {!formData.isNewCategory && (
                <div style={{ marginLeft: '2rem', marginBottom: '1rem' }}>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="controls-form-select"
                    style={{ width: '100%', maxWidth: '400px' }}
                  >
                    <option value="">Select a category</option>
                    {existingCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1.5rem',
                background: formData.isNewCategory ? '#e3f2fd' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => setFormData({...formData, isNewCategory: true})}>
                <input
                  type="radio"
                  id="new-cat"
                  name="categoryType"
                  checked={formData.isNewCategory}
                  onChange={() => setFormData({...formData, isNewCategory: true})}
                  style={{ marginRight: '0.5rem' }}
                />
                <label htmlFor="new-cat" style={{ cursor: 'pointer' }}>
                  <strong>New Category</strong>
                  <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                    Create a new category
                  </p>
                </label>
              </div>
              
              {formData.isNewCategory && (
                <div style={{ marginLeft: '2rem', marginTop: '1rem' }}>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="controls-form-control"
                    placeholder="Enter category name (e.g., machinery, tools)"
                    style={{ width: '100%', maxWidth: '400px' }}
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Step 2: Object Details */}
          {currentStep === 2 && (
            <div>
              <h3 style={{ marginBottom: '1.5rem' }}>Object Details</h3>
              
              <div className="controls-form-group">
                <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  Object Name: *
                </label>
                <input
                  type="text"
                  value={formData.objectName}
                  onChange={(e) => setFormData({...formData, objectName: e.target.value})}
                  className="controls-form-control"
                  placeholder="Enter object name"
                  style={{ fontSize: '1rem' }}
                />
                <small className="controls-text-muted" style={{ marginTop: '0.5rem', display: 'block' }}>
                  Example: Safety Cone, Tool Cabinet, etc.
                </small>
              </div>

              <div className="controls-form-group">
                <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  Description (Optional):
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="controls-form-control"
                  placeholder="Enter object description"
                  rows="3"
                  style={{ fontSize: '1rem' }}
                />
              </div>
            </div>
          )}
          
          {/* Step 3: Upload File */}
          {currentStep === 3 && (
            <div>
              <h3 style={{ marginBottom: '1.5rem' }}>Upload 3D File</h3>
              
              <div className="controls-form-group">
                <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  3D Model File: *
                </label>
                <input
                  type="file"
                  accept=".dae,.stl,.obj,.fbx,.gltf,.glb,.ply"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="controls-form-control"
                  style={{ padding: '0.75rem' }}
                />
                {file && (
                  <div style={{ marginTop: '0.5rem', color: '#4caf50' }}>
                    ✓ Selected: {file.name}
                  </div>
                )}
                <small className="controls-text-muted" style={{ marginTop: '0.5rem', display: 'block' }}>
                  Supported formats: STL, DAE (Collada), OBJ, FBX, GLTF, GLB, PLY
                  <br />Maximum file size: 50MB
                </small>
              </div>
            </div>
          )}
        </div>
        
        <div className="controls-modal-footer" style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '1.5rem 2rem',
          borderTop: '1px solid #e0e0e0'
        }}>
          <button 
            onClick={handlePrevious}
            className="controls-btn controls-btn-secondary"
            style={{ visibility: currentStep > 1 ? 'visible' : 'hidden' }}
          >
            Previous
          </button>
          
          <div style={{ marginLeft: 'auto' }}>
            {currentStep < 3 ? (
              <button 
                onClick={handleNext}
                className="controls-btn controls-btn-primary"
                disabled={!canProceedToNext()}
              >
                Next
              </button>
            ) : (
              <button 
                onClick={handleAddObject}
                className="controls-btn controls-btn-success"
                disabled={!canProceedToNext() || isUploading}
              >
                {isUploading ? 'Uploading...' : 'Add Object'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddEnvironment;