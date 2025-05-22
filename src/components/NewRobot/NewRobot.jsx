// src/components/NewRobot/NewRobot.jsx
import React, { useState, useEffect } from 'react';
import { useRobot } from '../../contexts/RobotContext';
import './NewRobot.css';

const NewRobot = ({ isOpen, onClose }) => {
  const { categories, addRobot } = useRobot();
  const [step, setStep] = useState(1); // 1: Manufacturer, 2: Robot Model, 3: Files
  const [isNewManufacturer, setIsNewManufacturer] = useState(false);
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [newManufacturerName, setNewManufacturerName] = useState('');
  const [newRobotName, setNewRobotName] = useState('');
  const [files, setFiles] = useState({
    urdf: null,
    meshes: []
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setIsNewManufacturer(false);
      setSelectedManufacturer('');
      setNewManufacturerName('');
      setNewRobotName('');
      setFiles({ urdf: null, meshes: [] });
      setUploadProgress(0);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNextStep = () => {
    // Validate current step
    if (step === 1) {
      if (isNewManufacturer && !newManufacturerName.trim()) {
        setError('Please enter a manufacturer name');
        return;
      }
      if (!isNewManufacturer && !selectedManufacturer) {
        setError('Please select a manufacturer');
        return;
      }
    } else if (step === 2) {
      if (!newRobotName.trim()) {
        setError('Please enter a robot model name');
        return;
      }
    }

    setError('');
    setStep(step + 1);
  };

  const handlePreviousStep = () => {
    setStep(step - 1);
  };

  const handleFileChange = (e, type) => {
    if (type === 'urdf') {
      const file = e.target.files[0];
      if (file && file.name.endsWith('.urdf')) {
        setFiles({ ...files, urdf: file });
      } else {
        setError('Please select a valid URDF file');
      }
    } else if (type === 'meshes') {
      const selectedFiles = Array.from(e.target.files);
      const validFiles = selectedFiles.filter(file => 
        file.name.endsWith('.stl') || file.name.endsWith('.dae')
      );

      if (validFiles.length !== selectedFiles.length) {
        setError('Some files are not valid mesh files (.stl or .dae)');
      }

      setFiles({ ...files, meshes: [...files.meshes, ...validFiles] });
    }
  };

  const handleSubmit = async () => {
    try {
      setError('');
      
      // Validate files
      if (!files.urdf) {
        setError('URDF file is required');
        return;
      }
      
      if (files.meshes.length === 0) {
        setError('At least one mesh file is required');
        return;
      }

      // Create form data for upload
      const formData = new FormData();
      formData.append('manufacturer', isNewManufacturer ? newManufacturerName : selectedManufacturer);
      formData.append('model', newRobotName);
      formData.append('urdf', files.urdf);
      
      files.meshes.forEach(file => {
        formData.append('meshes', file);
      });

      // Upload files with progress tracking
      const response = await addRobot(formData, (progress) => {
        setUploadProgress(progress);
      });

      if (response.success) {
        onClose(true); // Close with success flag
      } else {
        setError(response.message || 'Failed to add robot');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1: // Manufacturer Selection
        return (
          <div className="new-robot-step">
            <h3>Select Manufacturer</h3>
            
            <div className="option-selector">
              <label>
                <input
                  type="radio"
                  checked={!isNewManufacturer}
                  onChange={() => setIsNewManufacturer(false)}
                />
                Use existing manufacturer
              </label>
              
              {!isNewManufacturer && (
                <select
                  value={selectedManufacturer}
                  onChange={(e) => setSelectedManufacturer(e.target.value)}
                  disabled={isNewManufacturer}
                >
                  <option value="">Select Manufacturer</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="option-selector">
              <label>
                <input
                  type="radio"
                  checked={isNewManufacturer}
                  onChange={() => setIsNewManufacturer(true)}
                />
                Add new manufacturer
              </label>
              
              {isNewManufacturer && (
                <input
                  type="text"
                  placeholder="Enter manufacturer name"
                  value={newManufacturerName}
                  onChange={(e) => setNewManufacturerName(e.target.value)}
                  disabled={!isNewManufacturer}
                />
              )}
            </div>
          </div>
        );
        
      case 2: // Robot Model
        return (
          <div className="new-robot-step">
            <h3>Enter Robot Model</h3>
            <div className="form-group">
              <label htmlFor="robot-name">Robot Model Name:</label>
              <input
                id="robot-name"
                type="text"
                placeholder="e.g. UR5, KR3R540"
                value={newRobotName}
                onChange={(e) => setNewRobotName(e.target.value)}
              />
              <p className="help-text">
                Enter a unique name for your robot model
              </p>
            </div>
          </div>
        );
        
      case 3: // File Upload
        return (
          <div className="new-robot-step">
            <h3>Upload Robot Files</h3>
            
            <div className="form-group">
              <label htmlFor="urdf-file">URDF File:</label>
              <input
                id="urdf-file"
                type="file"
                accept=".urdf"
                onChange={(e) => handleFileChange(e, 'urdf')}
              />
              {files.urdf && (
                <div className="file-info">
                  <span>Selected: {files.urdf.name}</span>
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="mesh-files">Mesh Files:</label>
              <input
                id="mesh-files"
                type="file"
                accept=".stl,.dae"
                multiple
                onChange={(e) => handleFileChange(e, 'meshes')}
              />
              <p className="help-text">
                Select STL or DAE files for your robot model
              </p>
              
              {files.meshes.length > 0 && (
                <div className="file-list">
                  <h4>Selected Mesh Files ({files.meshes.length}):</h4>
                  <ul>
                    {files.meshes.map((file, index) => (
                      <li key={index}>{file.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            {uploadProgress > 0 && (
              <div className="upload-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <span>{uploadProgress}% uploaded</span>
              </div>
            )}
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="new-robot-overlay">
      <div className="new-robot-modal">
        <div className="new-robot-header">
          <h2>Add New Robot</h2>
          <button className="close-button" onClick={() => onClose(false)}>×</button>
        </div>
        
        <div className="new-robot-progress">
          <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>1. Manufacturer</div>
          <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>2. Robot Model</div>
          <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>3. Files</div>
        </div>
        
        {error && (
          <div className="error-message">{error}</div>
        )}
        
        <div className="new-robot-content">
          {renderStep()}
        </div>
        
        <div className="new-robot-actions">
          {step > 1 && (
            <button className="back-button" onClick={handlePreviousStep}>
              Back
            </button>
          )}
          
          {step < 3 ? (
            <button className="next-button" onClick={handleNextStep}>
              Next
            </button>
          ) : (
            <button 
              className="submit-button" 
              onClick={handleSubmit}
              disabled={uploadProgress > 0 && uploadProgress < 100}
            >
              {uploadProgress > 0 && uploadProgress < 100 ? 'Uploading...' : 'Add Robot'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewRobot;