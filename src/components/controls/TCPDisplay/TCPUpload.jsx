// src/components/controls/TCPDisplay/TCPUpload.jsx
import React, { useState } from 'react';
import './TCPManager.css';

const PREDEFINED_TCPS = {
  er20: {
    name: 'ER20 Collet',
    stlPath: '/tcp/er20.stl',
    category: 'tool',
    color: '#c0c0c0',
    dimensions: { width: 0.04, height: 0.08, depth: 0.04 }
  },
  square_tcp: {
    name: 'Square TCP',
    stlPath: '/tcp/square_tcp.stl', 
    category: 'custom',
    color: '#ff0000',
    dimensions: { width: 0.05, height: 0.05, depth: 0.05 }
  },
  gripper: {
    name: 'Standard Gripper',
    stlPath: '/tcp/gripper.stl',
    category: 'gripper', 
    color: '#333333',
    dimensions: { width: 0.08, height: 0.12, depth: 0.06 }
  }
};

const TCPUpload = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'custom',
    color: '#ff0000',
    dimensions: {
      width: 0,
      height: 0,
      depth: 0
    }
  });
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [tcpType, setTcpType] = useState('custom');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('dimensions.')) {
      const dimension = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        dimensions: {
          ...prev.dimensions,
          [dimension]: parseFloat(value) || 0
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.name.toLowerCase().endsWith('.stl')) {
      setFile(selectedFile);
      setError(null);
    } else {
      setFile(null);
      setError('Please select a valid STL file');
    }
  };

  const handleTcpTypeChange = (e) => {
    const newType = e.target.value;
    setTcpType(newType);
    
    if (newType !== 'custom') {
      const predefined = PREDEFINED_TCPS[newType];
      setFormData(prev => ({
        ...prev,
        name: predefined.name,
        category: predefined.category,
        color: predefined.color,
        dimensions: predefined.dimensions
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (tcpType === 'custom' && !file) {
      setError('Please select an STL file');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formDataToSend = new FormData();
      
      if (tcpType === 'custom') {
        formDataToSend.append('stlFile', file);
      } else {
        formDataToSend.append('stlPath', PREDEFINED_TCPS[tcpType].stlPath);
        formDataToSend.append('tcpType', tcpType);
      }
      
      formDataToSend.append('name', formData.name);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('color', formData.color);
      formDataToSend.append('dimensions', JSON.stringify(formData.dimensions));

      const response = await fetch('/api/tcp/add', {
        method: 'POST',
        body: formDataToSend
      });

      const result = await response.json();

      if (result.success) {
        onSuccess(result.tcp);
        onClose();
        // Reset form
        setFormData({
          name: '',
          description: '',
          category: 'custom',
          color: '#ff0000',
          dimensions: {
            width: 0,
            height: 0,
            depth: 0
          }
        });
        setFile(null);
        setTcpType('custom');
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

  return (
    <div className="tcp-upload-modal">
      <div className="tcp-upload-content">
        <h3>Upload TCP Tool</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="tcpType">TCP Type</label>
            <select
              id="tcpType"
              value={tcpType}
              onChange={handleTcpTypeChange}
            >
              <option value="custom">Custom Upload</option>
              <option value="er20">ER20 Collet</option>
              <option value="square_tcp">Square TCP</option>
              <option value="gripper">Standard Gripper</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
            >
              <option value="custom">Custom</option>
              <option value="gripper">Gripper</option>
              <option value="tool">Tool</option>
              <option value="sensor">Sensor</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="color">Color</label>
            <input
              type="color"
              id="color"
              name="color"
              value={formData.color}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-group">
            <label>Dimensions (meters)</label>
            <div className="dimensions-inputs">
              <input
                type="number"
                name="dimensions.width"
                value={formData.dimensions.width}
                onChange={handleInputChange}
                step="0.001"
                placeholder="Width"
              />
              <input
                type="number"
                name="dimensions.height"
                value={formData.dimensions.height}
                onChange={handleInputChange}
                step="0.001"
                placeholder="Height"
              />
              <input
                type="number"
                name="dimensions.depth"
                value={formData.dimensions.depth}
                onChange={handleInputChange}
                step="0.001"
                placeholder="Depth"
              />
            </div>
          </div>

          {tcpType === 'custom' ? (
            <div className="form-group">
              <label htmlFor="stlFile">STL File *</label>
              <input
                type="file"
                id="stlFile"
                accept=".stl"
                onChange={handleFileChange}
                required
              />
            </div>
          ) : (
            <div className="form-group">
              <p>Using predefined STL: {PREDEFINED_TCPS[tcpType].stlPath}</p>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TCPUpload;