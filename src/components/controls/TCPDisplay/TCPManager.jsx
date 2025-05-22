// src/components/controls/TCPManager/TCPManager.jsx
import React, { useState, useEffect } from 'react';
import tcpProvider from '../../../core/IK/TCP/TCPProvider';
import EventBus from '../../../utils/EventBus';
import './TCPManager.css';

/**
 * TCP Manager Component - Allows adding, editing, and managing multiple TCPs
 * This component provides full CRUD operations for TCP management
 */
const TCPManager = ({ viewerRef }) => {
  const [tcps, setTcps] = useState([]);
  const [activeTcpId, setActiveTcpId] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTcp, setEditingTcp] = useState(null);
  const [newTcpForm, setNewTcpForm] = useState({
    name: '',
    visible: true,
    size: 0.03,
    color: '#ff0000',
    offset: { x: 0, y: 0, z: 0 }
  });

  // Load initial data and set up EventBus listeners
  useEffect(() => {
    loadTCPs();
    
    const unsubscribeAdded = EventBus.on('tcp:added', handleTCPAdded);
    const unsubscribeRemoved = EventBus.on('tcp:removed', handleTCPRemoved);
    const unsubscribeActivated = EventBus.on('tcp:activated', handleTCPActivated);
    const unsubscribeSettingsUpdated = EventBus.on('tcp:settings-updated', handleSettingsUpdated);

    return () => {
      unsubscribeAdded();
      unsubscribeRemoved();
      unsubscribeActivated();
      unsubscribeSettingsUpdated();
    };
  }, []);

  /**
   * Load all TCPs from provider
   */
  const loadTCPs = () => {
    const allTcps = tcpProvider.getAllTCPs();
    const activeTcp = tcpProvider.getActiveTCP();
    
    setTcps(allTcps);
    setActiveTcpId(activeTcp?.id || null);
  };

  /**
   * Handle TCP added event from EventBus
   */
  const handleTCPAdded = (data) => {
    loadTCPs();
  };

  /**
   * Handle TCP removed event from EventBus  
   */
  const handleTCPRemoved = (data) => {
    loadTCPs();
  };

  /**
   * Handle TCP activated event from EventBus
   */
  const handleTCPActivated = (data) => {
    setActiveTcpId(data.id);
  };

  /**
   * Handle settings updated event from EventBus
   */
  const handleSettingsUpdated = (data) => {
    loadTCPs();
  };

  /**
   * Handle form input changes
   */
  const handleFormChange = (field, value) => {
    if (field.startsWith('offset.')) {
      const offsetField = field.split('.')[1];
      setNewTcpForm(prev => ({
        ...prev,
        offset: {
          ...prev.offset,
          [offsetField]: parseFloat(value) || 0
        }
      }));
    } else {
      setNewTcpForm(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  /**
   * Add new TCP
   */
  const handleAddTCP = () => {
    if (!newTcpForm.name.trim()) {
      alert('Please enter a TCP name');
      return;
    }

    const tcpId = tcpProvider.addTCP({
      name: newTcpForm.name.trim(),
      visible: newTcpForm.visible,
      size: parseFloat(newTcpForm.size) || 0.03,
      color: newTcpForm.color,
      offset: {
        x: parseFloat(newTcpForm.offset.x) || 0,
        y: parseFloat(newTcpForm.offset.y) || 0,
        z: parseFloat(newTcpForm.offset.z) || 0
      }
    });

    // Reset form and close modal
    setNewTcpForm({
      name: '',
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
    setIsAddModalOpen(false);

    // Activate the new TCP
    tcpProvider.setActiveTCP(tcpId);
  };

  /**
   * Remove TCP
   */
  const handleRemoveTCP = (tcpId) => {
    if (window.confirm('Are you sure you want to remove this TCP?')) {
      tcpProvider.removeTCP(tcpId);
    }
  };

  /**
   * Activate TCP
   */
  const handleActivateTCP = (tcpId) => {
    tcpProvider.setActiveTCP(tcpId);
  };

  /**
   * Start editing TCP
   */
  const handleEditTCP = (tcp) => {
    setEditingTcp(tcp.id);
    setNewTcpForm({
      name: tcp.name,
      visible: tcp.settings.visible,
      size: tcp.settings.size,
      color: tcp.settings.color,
      offset: { ...tcp.settings.offset }
    });
  };

  /**
   * Save TCP edits
   */
  const handleSaveEdit = () => {
    if (!editingTcp) return;

    tcpProvider.updateTCPSettings(editingTcp, {
      visible: newTcpForm.visible,
      size: parseFloat(newTcpForm.size) || 0.03,
      color: newTcpForm.color,
      offset: {
        x: parseFloat(newTcpForm.offset.x) || 0,
        y: parseFloat(newTcpForm.offset.y) || 0,
        z: parseFloat(newTcpForm.offset.z) || 0
      }
    });

    // Update name if changed (requires special handling)
    const tcp = tcpProvider.getTCP(editingTcp);
    if (tcp && tcp.name !== newTcpForm.name.trim()) {
      tcp.name = newTcpForm.name.trim();
      EventBus.emit('tcp:name_updated', { id: editingTcp, name: tcp.name });
    }

    setEditingTcp(null);
    setNewTcpForm({
      name: '',
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
  };

  /**
   * Cancel editing
   */
  const handleCancelEdit = () => {
    setEditingTcp(null);
    setNewTcpForm({
      name: '',
      visible: true,
      size: 0.03,
      color: '#ff0000',
      offset: { x: 0, y: 0, z: 0 }
    });
  };

  return (
    <div className="tcp-manager">
      <div className="tcp-manager__header">
        <h3>TCP Manager</h3>
        <button 
          className="tcp-manager__add-btn"
          onClick={() => setIsAddModalOpen(true)}
        >
          + Add TCP
        </button>
      </div>

      <div className="tcp-manager__content">
        {tcps.length === 0 ? (
          <div className="tcp-manager__empty">
            <p>No TCPs available</p>
            <button onClick={() => setIsAddModalOpen(true)}>
              Create your first TCP
            </button>
          </div>
        ) : (
          <div className="tcp-manager__list">
            {tcps.map(tcp => (
              <div 
                key={tcp.id}
                className={`tcp-manager__item ${tcp.id === activeTcpId ? 'tcp-manager__item--active' : ''}`}
              >
                <div className="tcp-manager__item-header">
                  <div className="tcp-manager__item-info">
                    <div className="tcp-manager__item-name">
                      {tcp.name}
                      {tcp.isDefault && <span className="tcp-manager__badge">Default</span>}
                    </div>
                    <div className="tcp-manager__item-id">ID: {tcp.id}</div>
                  </div>
                  <div className="tcp-manager__item-actions">
                    {tcp.id !== activeTcpId && (
                      <button 
                        className="tcp-manager__btn tcp-manager__btn--activate"
                        onClick={() => handleActivateTCP(tcp.id)}
                      >
                        Activate
                      </button>
                    )}
                    <button 
                      className="tcp-manager__btn tcp-manager__btn--edit"
                      onClick={() => handleEditTCP(tcp)}
                    >
                      Edit
                    </button>
                    {!tcp.isDefault && (
                      <button 
                        className="tcp-manager__btn tcp-manager__btn--remove"
                        onClick={() => handleRemoveTCP(tcp.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="tcp-manager__item-details">
                  <div className="tcp-manager__item-settings">
                    <span className={`tcp-manager__visibility ${tcp.settings.visible ? 'tcp-manager__visibility--visible' : 'tcp-manager__visibility--hidden'}`}>
                      {tcp.settings.visible ? '👁️ Visible' : '🚫 Hidden'}
                    </span>
                    <span className="tcp-manager__size">Size: {tcp.settings.size.toFixed(3)}</span>
                    <div className="tcp-manager__color-info">
                      <div 
                        className="tcp-manager__color-preview"
                        style={{ backgroundColor: tcp.settings.color }}
                      ></div>
                      <span>{tcp.settings.color}</span>
                    </div>
                  </div>
                  <div className="tcp-manager__item-offset">
                    <strong>Offset:</strong> 
                    X: {tcp.settings.offset.x.toFixed(3)}, 
                    Y: {tcp.settings.offset.y.toFixed(3)}, 
                    Z: {tcp.settings.offset.z.toFixed(3)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(isAddModalOpen || editingTcp) && (
        <div className="tcp-manager__modal-overlay">
          <div className="tcp-manager__modal">
            <div className="tcp-manager__modal-header">
              <h3>{editingTcp ? 'Edit TCP' : 'Add New TCP'}</h3>
              <button 
                className="tcp-manager__modal-close"
                onClick={() => {
                  setIsAddModalOpen(false);
                  handleCancelEdit();
                }}
              >
                ×
              </button>
            </div>

            <div className="tcp-manager__modal-content">
              <div className="tcp-manager__form-group">
                <label>TCP Name:</label>
                <input
                  type="text"
                  value={newTcpForm.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="Enter TCP name"
                />
              </div>

              <div className="tcp-manager__form-row">
                <div className="tcp-manager__form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={newTcpForm.visible}
                      onChange={(e) => handleFormChange('visible', e.target.checked)}
                    />
                    Visible
                  </label>
                </div>
                <div className="tcp-manager__form-group">
                  <label>Size:</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    max="0.5"
                    value={newTcpForm.size}
                    onChange={(e) => handleFormChange('size', e.target.value)}
                  />
                </div>
                <div className="tcp-manager__form-group">
                  <label>Color:</label>
                  <input
                    type="color"
                    value={newTcpForm.color}
                    onChange={(e) => handleFormChange('color', e.target.value)}
                  />
                </div>
              </div>

              <div className="tcp-manager__form-group">
                <label>TCP Offset:</label>
                <div className="tcp-manager__offset-inputs">
                  <div>
                    <label>X:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={newTcpForm.offset.x}
                      onChange={(e) => handleFormChange('offset.x', e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Y:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={newTcpForm.offset.y}
                      onChange={(e) => handleFormChange('offset.y', e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Z:</label>
                    <input
                      type="number"
                      step="0.001"
                      value={newTcpForm.offset.z}
                      onChange={(e) => handleFormChange('offset.z', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="tcp-manager__modal-actions">
              <button 
                className="tcp-manager__btn tcp-manager__btn--cancel"
                onClick={() => {
                  setIsAddModalOpen(false);
                  handleCancelEdit();
                }}
              >
                Cancel
              </button>
              <button 
                className="tcp-manager__btn tcp-manager__btn--save"
                onClick={editingTcp ? handleSaveEdit : handleAddTCP}
              >
                {editingTcp ? 'Save Changes' : 'Add TCP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TCPManager;