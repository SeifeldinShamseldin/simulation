import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const AddRobot = ({ isOpen, onClose, onSuccess }) => {
  const [availableRobots, setAvailableRobots] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState({});
  const [formData, setFormData] = useState({});

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

  // Scan for available robots when modal opens
  useEffect(() => {
    if (isOpen) {
      scanLocalRobots();
    }
  }, [isOpen]);

  const scanLocalRobots = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/robots/list');
      const data = await response.json();
      setCategories(data);
      
      // Flatten all robots for easy access
      const allRobots = [];
      data.forEach(category => {
        category.robots.forEach(robot => {
          allRobots.push({
            ...robot,
            manufacturer: category.name,
            manufacturerId: category.id
          });
        });
      });
      setAvailableRobots(allRobots);
    } catch (err) {
      console.error('Error scanning robots:', err);
      setError('Failed to scan robots');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRobot = async (robot) => {
    // Create the robot data
    const newRobot = {
      id: robot.id,
      name: robot.name,
      manufacturer: robot.manufacturer,
      urdfPath: robot.urdfPath,
      model: robot.name
    };
    
    // Call onSuccess which will add to workspace AND load into scene
    onSuccess(newRobot);
  };

  const getIconForManufacturer = (name) => {
    const iconMap = {
      'kuka': '🤖',
      'ur': '🦾',
      'fanuc': '🏭',
      'abb': '⚙️',
      'yaskawa': '🔧'
    };
    return iconMap[name.toLowerCase()] || '🤖';
  };

  const handleAddRobot = async () => {
    if (!canProceedToNext()) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const data = new FormData();
      
      // Add text fields
      data.append('manufacturer', formData.isNewManufacturer ? formData.manufacturer : selectedCategory.name);
      data.append('model', formData.model);
      
      // Add URDF file
      if (files.urdf) {
        data.append('urdf', files.urdf);
      }
      
      // Add mesh files
      if (files.meshes && files.meshes.length > 0) {
        files.meshes.forEach((file) => {
          data.append('meshes', file);
        });
      }

      const response = await fetch('/api/robots/add', {
        method: 'POST',
        body: data
        // Don't set Content-Type header - let browser set it with boundary
      });

      const result = await response.json();

      if (result.success) {
        onSuccess({
          id: result.robot.id,
          name: result.robot.name,
          manufacturer: result.robot.manufacturer,
          urdfPath: `/robots/${result.robot.manufacturer}/${result.robot.name}/${result.robot.urdfFile}`,
          model: result.robot.name
        });
      } else {
        setError(result.message || 'Upload failed');
      }
    } catch (error) {
      setError('Error uploading robot: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="controls-modal-overlay">
      <div className="controls-modal" style={{ maxWidth: '800px', maxHeight: '600px' }}>
        <div className="controls-modal-header">
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
            {selectedCategory ? `${selectedCategory.name} Robots` : 'Select Robot'}
          </h2>
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
        
        <div className="controls-modal-body" style={{ padding: '2rem', overflowY: 'auto', maxHeight: '500px' }}>
          {isLoading ? (
            <div className="controls-text-center controls-p-5">
              <div className="controls-spinner-border" role="status">
                <span className="controls-sr-only">Scanning robots...</span>
              </div>
              <p className="controls-mt-3">Scanning local robots...</p>
            </div>
          ) : error ? (
            <div className="controls-alert controls-alert-danger">
              {error}
              <button 
                className="controls-btn controls-btn-sm controls-btn-danger controls-mt-2"
                onClick={scanLocalRobots}
              >
                Try Again
              </button>
            </div>
          ) : !selectedCategory ? (
            // Show manufacturers
            <div>
              <h4 className="controls-h4 controls-mb-3">Available Manufacturers</h4>
              <div className="controls-grid controls-grid-cols-3 controls-gap-3">
                {categories.map(category => (
                  <div
                    key={category.id}
                    className="controls-card"
                    onClick={() => setSelectedCategory(category)}
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <div className="controls-card-body controls-text-center controls-p-4">
                      <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
                        {getIconForManufacturer(category.name)}
                      </div>
                      <h5 className="controls-h5 controls-mb-1">{category.name}</h5>
                      <small className="controls-text-muted">{category.robots.length} robots</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Show robots from selected manufacturer
            <div>
              <button
                onClick={() => setSelectedCategory(null)}
                className="controls-btn controls-btn-link controls-p-0 controls-mb-3"
                style={{
                  textDecoration: 'none',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                ← Back to Manufacturers
              </button>
              
              <h4 className="controls-h4 controls-mb-3">
                {getIconForManufacturer(selectedCategory.name)} {selectedCategory.name} Robots
              </h4>
              
              <div className="controls-grid controls-grid-cols-2 controls-gap-3">
                {selectedCategory.robots.map(robot => (
                  <div
                    key={robot.id}
                    className="controls-card"
                    onClick={() => handleSelectRobot({
                      ...robot,
                      manufacturer: selectedCategory.name
                    })}
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <div className="controls-card-body">
                      <h5 className="controls-h5 controls-mb-2">{robot.name}</h5>
                      <p className="controls-text-muted controls-small controls-mb-3">
                        URDF • Ready to load
                      </p>
                      <button className="controls-btn controls-btn-success controls-btn-sm controls-btn-block">
                        + Add to Workspace
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddRobot; 