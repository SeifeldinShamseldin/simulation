import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRobot } from '../../../contexts/RobotContext';
import EventBus from '../../../utils/EventBus';

const RobotPanel = ({ viewerRef }) => {
  const { categories, availableRobots, isLoading, error, loadRobot, addRobot } = useRobot();
  const [activeTab, setActiveTab] = useState('load');
  const [selectedRobots, setSelectedRobots] = useState([]);
  const [loadedRobots, setLoadedRobots] = useState(new Map());
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  
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

  // Listen for robot events
  useEffect(() => {
    const unsubscribeLoaded = EventBus.on('robot:loaded', (data) => {
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.set(data.robotName, {
          name: data.robotName,
          isActive: true
        });
        return newMap;
      });
    });

    const unsubscribeRemoved = EventBus.on('robot:removed', (data) => {
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.robotName);
        return newMap;
      });
    });

    const unsubscribeActiveChanged = EventBus.on('robot:active-changed', (data) => {
      setLoadedRobots(prev => {
        const newMap = new Map(prev);
        const robot = newMap.get(data.robotName);
        if (robot) {
          robot.isActive = data.isActive;
        }
        return newMap;
      });
    });

    return () => {
      unsubscribeLoaded();
      unsubscribeRemoved();
      unsubscribeActiveChanged();
    };
  }, []);
  
  const toggleRobotSelection = (robotId) => {
    setSelectedRobots(prev => {
      if (prev.includes(robotId)) {
        return prev.filter(id => id !== robotId);
      } else {
        return [...prev, robotId];
      }
    });
  };
  
  const handleLoadRobots = async () => {
    if (selectedRobots.length === 0 || !viewerRef?.current) return;
    
    const robotManager = viewerRef.current.robotManagerRef?.current;
    if (!robotManager) return;
    
    // Calculate positions for multiple robots
    const positions = robotManager.calculateRobotPositions(selectedRobots.length);
    
    // Load each selected robot
    for (let i = 0; i < selectedRobots.length; i++) {
      const robotId = selectedRobots[i];
      const robot = availableRobots.find(r => r.id === robotId);
      
      if (robot) {
        try {
          await loadRobot(robot.id, robot.urdfPath, {
            position: positions[i],
            makeActive: true,
            clearOthers: false // Don't clear other robots
          });
        } catch (error) {
          console.error(`Failed to load robot ${robot.name}:`, error);
        }
      }
    }
    
    // Clear selection after loading
    setSelectedRobots([]);
  };

  const toggleRobotActive = (robotName) => {
    const robotManager = viewerRef.current?.robotManagerRef?.current;
    if (!robotManager) return;

    const robot = loadedRobots.get(robotName);
    if (robot) {
      robotManager.setRobotActive(robotName, !robot.isActive);
    }
  };

  const removeRobot = (robotName) => {
    const robotManager = viewerRef.current?.robotManagerRef?.current;
    if (!robotManager) return;

    robotManager.removeRobot(robotName);
  };

  const clearAllRobots = () => {
    const robotManager = viewerRef.current?.robotManagerRef?.current;
    if (!robotManager) return;

    robotManager.clearAllRobots();
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
            className={`controls-btn controls-btn-sm ${activeTab === 'manage' ? 'controls-btn-primary' : 'controls-btn-light'}`}
            onClick={() => setActiveTab('manage')}
          >
            Manage
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
          <div className="controls-mb-3">
            <h4 className="controls-h6">Select Robots to Load:</h4>
            <small className="controls-text-muted">
              Select multiple robots to load them simultaneously
            </small>
          </div>
          
          {categories.map(category => (
            <div key={category.id} className="controls-mb-3">
              <h5 className="controls-h6 controls-mb-2">{category.name}</h5>
              <div className="controls-list">
                {category.robots.map(robot => (
                  <label 
                    key={robot.id} 
                    className="controls-list-item controls-d-flex controls-align-items-center"
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      className="controls-form-check-input controls-me-2"
                      checked={selectedRobots.includes(robot.id)}
                      onChange={() => toggleRobotSelection(robot.id)}
                    />
                    <span className="controls-flex-grow-1">{robot.name}</span>
                    {loadedRobots.has(robot.id) && (
                      <span className="controls-badge controls-badge-success controls-ms-2">
                        Loaded
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          
          <button 
            onClick={handleLoadRobots}
            className="controls-btn controls-btn-primary controls-btn-block"
            disabled={isLoading || selectedRobots.length === 0}
          >
            {isLoading ? 'Loading...' : `Load ${selectedRobots.length} Robot${selectedRobots.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      ) : activeTab === 'manage' ? (
        <div className="controls-card-body">
          {loadedRobots.size === 0 ? (
            <div className="controls-text-center controls-text-muted controls-py-4">
              No robots loaded
            </div>
          ) : (
            <>
              <div className="controls-d-flex controls-justify-content-between controls-align-items-center controls-mb-3">
                <h4 className="controls-h6 controls-mb-0">Loaded Robots ({loadedRobots.size})</h4>
                <button
                  onClick={clearAllRobots}
                  className="controls-btn controls-btn-danger controls-btn-sm"
                >
                  Clear All
                </button>
              </div>
              
              <div className="controls-list">
                {Array.from(loadedRobots.entries()).map(([robotName, robot]) => (
                  <div key={robotName} className="controls-list-item">
                    <div className="controls-d-flex controls-align-items-center controls-justify-content-between">
                      <div className="controls-d-flex controls-align-items-center">
                        <label className="controls-form-check controls-mb-0 controls-me-3">
                          <input
                            type="checkbox"
                            className="controls-form-check-input"
                            checked={robot.isActive}
                            onChange={() => toggleRobotActive(robotName)}
                          />
                        </label>
                        <span className={robot.isActive ? '' : 'controls-text-muted'}>
                          {robotName}
                        </span>
                      </div>
                      <button
                        onClick={() => removeRobot(robotName)}
                        className="controls-btn controls-btn-danger controls-btn-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
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