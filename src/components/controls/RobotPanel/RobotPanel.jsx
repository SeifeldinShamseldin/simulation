import React, { useState, useEffect } from 'react';
import { useRobot } from '../../../contexts/RobotContext';

const RobotPanel = ({ viewerRef }) => {
  const { categories, availableRobots, isLoading, error, loadRobot, addRobot } = useRobot();
  const [activeTab, setActiveTab] = useState('load');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedRobot, setSelectedRobot] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  
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
  
  // Get robots for selected category
  const categoryRobots = selectedCategory ? 
    availableRobots.filter(r => r.category === selectedCategory) : [];
  
  // Auto-select first category
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories]);
  
  // Auto-select first robot in category
  useEffect(() => {
    if (categoryRobots.length > 0 && !selectedRobot) {
      setSelectedRobot(categoryRobots[0].id);
    }
  }, [categoryRobots]);
  
  const handleLoadRobot = async () => {
    if (!selectedRobot) return;
    
    const robot = availableRobots.find(r => r.id === selectedRobot);
    if (robot && viewerRef?.current) {
      await loadRobot(robot.id, robot.urdfPath);
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
      setShowAddModal(false);
      setActiveTab('load');
      // Reset form
      setFormData({ manufacturer: '', model: '', isNewManufacturer: false });
      setFiles({ urdf: null, meshes: [] });
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
      {showAddModal && (
        <div className="controls-modal-overlay">
          <div className="controls-modal">
            <div className="controls-modal-header">
              <h3>Add New Robot</h3>
              <button onClick={() => setShowAddModal(false)}>×</button>
            </div>
            
            <div className="controls-modal-body">
              <div className="controls-form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isNewManufacturer}
                    onChange={(e) => setFormData({...formData, isNewManufacturer: e.target.checked})}
                  />
                  New Manufacturer
                </label>
              </div>
              
              {formData.isNewManufacturer && (
                <div className="controls-form-group">
                  <label>Manufacturer Name:</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({...formData, manufacturer: e.target.value})}
                    className="controls-form-control"
                  />
                </div>
              )}
              
              <div className="controls-form-group">
                <label>Model Name:</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({...formData, model: e.target.value})}
                  className="controls-form-control"
                  required
                />
              </div>
              
              <div className="controls-form-group">
                <label>URDF File:</label>
                <input
                  type="file"
                  accept=".urdf"
                  onChange={(e) => setFiles({...files, urdf: e.target.files[0]})}
                  className="controls-form-control"
                  required
                />
              </div>
              
              <div className="controls-form-group">
                <label>Mesh Files:</label>
                <input
                  type="file"
                  accept=".stl,.dae"
                  multiple
                  onChange={(e) => setFiles({...files, meshes: Array.from(e.target.files)})}
                  className="controls-form-control"
                  required
                />
              </div>
            </div>
            
            <div className="controls-modal-footer">
              <button onClick={() => setShowAddModal(false)} className="controls-btn controls-btn-secondary">
                Cancel
              </button>
              <button onClick={handleAddRobot} className="controls-btn controls-btn-primary">
                Add Robot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RobotPanel; 