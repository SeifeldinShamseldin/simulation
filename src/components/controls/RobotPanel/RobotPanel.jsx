import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRobot } from '../../../contexts/RobotContext';

const RobotPanel = ({ viewerRef }) => {
  const { categories, availableRobots, isLoading, error, loadRobot, addRobot } = useRobot();
  const [activeTab, setActiveTab] = useState('load');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRobot, setSelectedRobot] = useState('');
  const [categoryRobots, setCategoryRobots] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // Add step tracking
  
  // Add robot form state
  const [formData, setFormData] = useState({
    manufacturer: '',
    model: '',
    isNewManufacturer: false
  });
  const [files, setFiles] = useState({
    urdf: null,
    meshes: []
  });
  
  // Auto-select first category
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories]);

  // Handle category changes
  useEffect(() => {
    if (selectedCategory) {
      const robots = availableRobots.filter(robot => robot.category === selectedCategory);
      setCategoryRobots(robots);
      
      // Always reset the selected robot when category changes
      if (robots.length > 0) {
        setSelectedRobot(robots[0].id);
      } else {
        setSelectedRobot('');
      }
    } else {
      setCategoryRobots([]);
      setSelectedRobot('');
    }
  }, [selectedCategory, availableRobots]);
  
  const handleLoadRobot = async () => {
    if (!selectedRobot || !viewerRef?.current) return;
    
    // Find the robot in the current category robots, not all robots
    const robot = categoryRobots.find(r => r.id === selectedRobot);
    if (!robot) {
      console.error('Selected robot not found in current category');
      return;
    }
    
    try {
      await loadRobot(robot.id, robot.urdfPath);
    } catch (error) {
      console.error("Failed to load robot:", error);
    }
  };
  
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

  const handleAddRobot = async () => {
    const data = new FormData();
    data.append('manufacturer', formData.isNewManufacturer ? formData.manufacturer : selectedCategory);
    data.append('model', formData.model);
    data.append('urdf', files.urdf);
    
    files.meshes.forEach(file => {
      data.append('meshes', file);
    });
    
    const result = await addRobot(data);
    if (result.success) {
      closeModal();
      setActiveTab('load');
    }
  };

  const closeModal = () => {
    setShowAddModal(false);
    setCurrentStep(1);
    setFormData({ manufacturer: '', model: '', isNewManufacturer: false });
    setFiles({ urdf: null, meshes: [] });
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 1:
        return formData.isNewManufacturer ? !!formData.manufacturer : !!selectedCategory;
      case 2:
        return !!formData.model;
      case 3:
        return !!files.urdf && files.meshes.length > 0;
      default:
        return false;
    }
  };

  return (
    <div className="controls-section">
      <div className="controls-section-header">
        <h3 className="controls-section-title">Robot Management</h3>
        <div className="controls-btn-group">
          <button
            className={`controls-btn controls-btn-sm ${activeTab === 'load' ? 'controls-btn-primary' : 'controls-btn-light'}`}
            onClick={() => setActiveTab('load')}
          >
            Load
          </button>
          <button
            className={`controls-btn controls-btn-sm ${activeTab === 'add' ? 'controls-btn-primary' : 'controls-btn-light'}`}
            onClick={() => setActiveTab('add')}
          >
            Add New
          </button>
        </div>
      </div>

      {error && (
        <div className="controls-alert controls-alert-danger">
          {error}
        </div>
      )}

      {activeTab === 'load' ? (
        <div className="controls-card-body">
          <div className="controls-form-group">
            <label>Manufacturer:</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="controls-form-select"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          
          <div className="controls-form-group">
            <label>Robot Model:</label>
            <select
              value={selectedRobot}
              onChange={(e) => setSelectedRobot(e.target.value)}
              className="controls-form-select"
              disabled={!categoryRobots.length}
            >
              {categoryRobots.map(robot => (
                <option key={robot.id} value={robot.id}>{robot.name}</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={handleLoadRobot}
            className="controls-btn controls-btn-primary controls-btn-block"
            disabled={isLoading || !selectedRobot}
          >
            {isLoading ? 'Loading...' : 'Load Robot'}
          </button>
        </div>
      ) : (
        <div className="controls-card-body">
          <button 
            onClick={() => setShowAddModal(true)}
            className="controls-btn controls-btn-success controls-btn-block"
          >
            + Add New Robot
          </button>
        </div>
      )}

      {/* Add Robot Modal */}
      {showAddModal && createPortal(
        <div className="controls-modal-overlay">
          <div className="controls-modal" style={{ maxWidth: '700px', minHeight: '500px' }}>
            <div className="controls-modal-header">
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Add New Robot</h2>
              <button 
                className="controls-close"
                onClick={closeModal}
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
                <span style={{ fontWeight: '500' }}>Select Manufacturer</span>
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
                <span style={{ fontWeight: '500' }}>Model Details</span>
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
                <span style={{ fontWeight: '500' }}>Upload Files</span>
              </div>
            </div>
            
            <div className="controls-modal-body" style={{ padding: '2rem', minHeight: '300px' }}>
              {/* Step 1: Manufacturer Selection */}
              {currentStep === 1 && (
                <div>
                  <h3 style={{ marginBottom: '1.5rem' }}>Select Manufacturer</h3>
                  
                  <div style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    marginBottom: '1rem',
                    background: !formData.isNewManufacturer ? '#e3f2fd' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setFormData({...formData, isNewManufacturer: false})}>
                    <input
                      type="radio"
                      id="existing"
                      name="manufacturerType"
                      checked={!formData.isNewManufacturer}
                      onChange={() => setFormData({...formData, isNewManufacturer: false})}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <label htmlFor="existing" style={{ cursor: 'pointer' }}>
                      <strong>Existing Manufacturer</strong>
                      <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                        Choose from available manufacturers
                      </p>
                    </label>
                  </div>
                  
                  {!formData.isNewManufacturer && (
                    <div style={{ marginLeft: '2rem', marginBottom: '1rem' }}>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="controls-form-select"
                        style={{ width: '100%', maxWidth: '400px' }}
                      >
                        <option value="">Select a manufacturer</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <div style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    background: formData.isNewManufacturer ? '#e3f2fd' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setFormData({...formData, isNewManufacturer: true})}>
                    <input
                      type="radio"
                      id="new"
                      name="manufacturerType"
                      checked={formData.isNewManufacturer}
                      onChange={() => setFormData({...formData, isNewManufacturer: true})}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <label htmlFor="new" style={{ cursor: 'pointer' }}>
                      <strong>New Manufacturer</strong>
                      <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>
                        Create a new manufacturer
                      </p>
                    </label>
                  </div>
                  
                  {formData.isNewManufacturer && (
                    <div style={{ marginLeft: '2rem', marginTop: '1rem' }}>
                      <input
                        type="text"
                        value={formData.manufacturer}
                        onChange={(e) => setFormData({...formData, manufacturer: e.target.value})}
                        className="controls-form-control"
                        placeholder="Enter manufacturer name"
                        style={{ width: '100%', maxWidth: '400px' }}
                      />
                    </div>
                  )}
                </div>
              )}
              
              {/* Step 2: Model Details */}
              {currentStep === 2 && (
                <div>
                  <h3 style={{ marginBottom: '1.5rem' }}>Robot Model Details</h3>
                  
                  <div className="controls-form-group">
                    <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                      Model Name:
                    </label>
                    <input
                      type="text"
                      value={formData.model}
                      onChange={(e) => setFormData({...formData, model: e.target.value})}
                      className="controls-form-control"
                      placeholder="Enter robot model name"
                      style={{ fontSize: '1rem' }}
                    />
                    <small className="controls-text-muted" style={{ marginTop: '0.5rem', display: 'block' }}>
                      Example: KR 16, UR5e, etc.
                    </small>
                  </div>
                </div>
              )}
              
              {/* Step 3: Upload Files */}
              {currentStep === 3 && (
                <div>
                  <h3 style={{ marginBottom: '1.5rem' }}>Upload Robot Files</h3>
                  
                  <div className="controls-form-group" style={{ marginBottom: '2rem' }}>
                    <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                      URDF File:
                    </label>
                    <input
                      type="file"
                      accept=".urdf"
                      onChange={(e) => setFiles({...files, urdf: e.target.files[0]})}
                      className="controls-form-control"
                      style={{ padding: '0.75rem' }}
                    />
                    {files.urdf && (
                      <div style={{ marginTop: '0.5rem', color: '#4caf50' }}>
                        ✓ Selected: {files.urdf.name}
                      </div>
                    )}
                  </div>
                  
                  <div className="controls-form-group">
                    <label className="controls-form-label" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                      Mesh Files:
                    </label>
                    <input
                      type="file"
                      accept=".stl,.dae"
                      multiple
                      onChange={(e) => setFiles({...files, meshes: Array.from(e.target.files)})}
                      className="controls-form-control"
                      style={{ padding: '0.75rem' }}
                    />
                    {files.meshes.length > 0 && (
                      <div style={{ marginTop: '0.5rem', color: '#4caf50' }}>
                        ✓ Selected: {files.meshes.length} file(s)
                        <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                          {files.meshes.map((file, idx) => (
                            <li key={idx} style={{ listStyle: 'none', fontSize: '0.9rem', color: '#666' }}>
                              • {file.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
                    onClick={handleAddRobot}
                    className="controls-btn controls-btn-success"
                    disabled={!canProceedToNext() || isLoading}
                  >
                    {isLoading ? 'Adding...' : 'Add Robot'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default RobotPanel; 