// src/components/controls/EnvironmentManager/EnvironmentManager.jsx
import React, { useState, useEffect } from 'react';
import EventBus from '../../../utils/EventBus';
import humanController from '../../../core/Human/HumanController';
import '../../../styles/ControlsTheme.css';

// Predefined object library
const OBJECT_LIBRARY = [
  {
    id: 'workshop_table',
    name: 'Workshop Table',
    path: '/objects/table/complete_table.dae',
    category: 'furniture',
    thumbnail: '🪑',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0,
    material: {
      type: 'phong',
      color: 0x8e9fa3,
      shininess: 100,
      specular: 0x222222
    }
  },
  {
    id: 'conveyor_belt',
    name: 'Conveyor Belt',
    path: '/objects/conveyor/conveyor.dae',
    category: 'industrial',
    thumbnail: '📦',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0.1
  },
  {
    id: 'tool_rack',
    name: 'Tool Rack',
    path: '/objects/tools/rack.dae',
    category: 'storage',
    thumbnail: '🔧',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0
  },
  {
    id: 'safety_fence',
    name: 'Safety Fence',
    path: '/objects/safety/fence.dae',
    category: 'safety',
    thumbnail: '🚧',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0
  },
  {
    id: 'control_panel',
    name: 'Control Panel',
    path: '/objects/controls/panel.dae',
    category: 'controls',
    thumbnail: '🎛️',
    defaultScale: { x: 1, y: 1, z: 1 },
    groundOffset: 0.8
  }
];

const EnvironmentManager = ({ viewerRef, isPanel = false, onClose }) => {
  const [categories, setCategories] = useState([]);
  const [loadedObjects, setLoadedObjects] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentView, setCurrentView] = useState('categories'); // 'categories' or 'objects'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [spawnedHumans, setSpawnedHumans] = useState([]);
  const [selectedHuman, setSelectedHuman] = useState(null);
  const [humanLoaded, setHumanLoaded] = useState(false);
  const [humanInfo, setHumanInfo] = useState(null);

  // Scan environment directory on mount
  useEffect(() => {
    scanEnvironment();
  }, []);

  // Listen for human events
  useEffect(() => {
    const unsubscribeSpawned = EventBus.on('human:spawned', (data) => {
      setSpawnedHumans(prev => [...prev, data]);
      if (data.isActive) {
        setSelectedHuman(data.id);
      }
    });
    
    const unsubscribeRemoved = EventBus.on('human:removed', (data) => {
      setSpawnedHumans(prev => prev.filter(h => h.id !== data.id));
      if (selectedHuman === data.id) {
        setSelectedHuman(null);
      }
    });
    
    const unsubscribeSelected = EventBus.on('human:selected', (data) => {
      setSelectedHuman(data.id);
    });
    
    return () => {
      unsubscribeSpawned();
      unsubscribeRemoved();
      unsubscribeSelected();
    };
  }, [selectedHuman]);

  const scanEnvironment = async () => {
    setIsScanning(true);
    setError(null);
    
    try {
      const response = await fetch('/api/environment/scan');
      const result = await response.json();
      
      if (result.success) {
        setCategories(result.categories);
      } else {
        setError('Failed to scan environment directory');
      }
    } catch (err) {
      console.error('Error scanning environment:', err);
      setError('Error scanning environment directory');
    } finally {
      setIsScanning(false);
    }
  };

  const loadObject = async (objectConfig) => {
    if (!viewerRef?.current) return;
    
    // Special handling for human
    if (objectConfig.category === 'human') {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) return;
      
      setLoading(true);
      try {
        // Random spawn position
        const position = {
          x: (Math.random() - 0.5) * 4,
          y: 0,
          z: (Math.random() - 0.5) * 4
        };
        
        await humanController.spawnHuman(
          sceneSetup.scene, 
          sceneSetup.world,
          position
        );
        
        setSuccessMessage('Human spawned! Press number keys (1-9) to select different humans.');
        setTimeout(() => setSuccessMessage(''), 5000);
      } catch (error) {
        setError('Failed to spawn human: ' + error.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    
    // Original loadObject code for other objects
    setLoading(true);
    setError(null);
    
    try {
      const sceneSetup = viewerRef.current.getSceneSetup();
      if (!sceneSetup) throw new Error('Scene not initialized');
      
      const instanceId = `${objectConfig.id}_${Date.now()}`;
      
      const object3D = await sceneSetup.loadEnvironmentObject({
        ...objectConfig,
        id: instanceId,
        castShadow: true,
        receiveShadow: true
      });
      
      setLoadedObjects(prev => [...prev, {
        instanceId,
        objectId: objectConfig.id,
        name: objectConfig.name,
        category: objectConfig.category
      }]);
      
      setSuccessMessage(`Added ${objectConfig.name} to scene`);
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (err) {
      console.error('Failed to load object:', err);
      setError(`Failed to load ${objectConfig.name}`);
    } finally {
      setLoading(false);
    }
  };

  const spawnHuman = async () => {
    if (!viewerRef?.current || humanLoaded) return;
    
    const sceneSetup = viewerRef.current.getSceneSetup();
    if (!sceneSetup) return;
    
    setLoading(true);
    try {
      await humanController.initialize(sceneSetup.scene, sceneSetup.world);
      setSuccessMessage('Human character spawned! Use WASD to move, Shift to run.');
    } catch (error) {
      setError('Failed to spawn human: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const selectCategory = (category) => {
    setSelectedCategory(category);
    setCurrentView('objects');
  };

  const goBack = () => {
    setCurrentView('categories');
    setSelectedCategory(null);
  };

  // Render category boxes
  const renderCategories = () => (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => selectCategory(cat)}
            style={{
              background: '#fff',
              border: '2px solid #e0e0e0',
              borderRadius: '8px',
              padding: '2rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textAlign: 'center',
              ':hover': {
                borderColor: '#007bff',
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#007bff';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e0e0e0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>{cat.icon}</div>
            <div style={{ fontWeight: '600', color: '#333' }}>{cat.name}</div>
            <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
              {cat.objects.length} items
            </div>
          </button>
        ))}
      </div>
      
      {/* Human controls */}
      {spawnedHumans.length > 0 && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <h4 style={{ margin: '0 0 1rem 0' }}>Spawned Humans ({spawnedHumans.length})</h4>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
            Use number keys 1-{Math.min(spawnedHumans.length, 9)} to select • WASD to move • Shift to run
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {spawnedHumans.map((human, index) => (
              <button
                key={human.id}
                onClick={() => humanController.selectHuman(human.id)}
                style={{
                  padding: '0.5rem 1rem',
                  background: selectedHuman === human.id ? '#007bff' : '#fff',
                  color: selectedHuman === human.id ? '#fff' : '#333',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  transition: 'all 0.2s'
                }}
              >
                Human {index + 1}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (selectedHuman) {
                humanController.removeHuman(selectedHuman);
              }
            }}
            disabled={!selectedHuman}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1rem',
              background: selectedHuman ? '#dc3545' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedHuman ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem'
            }}
          >
            Remove Selected Human
          </button>
        </div>
      )}
    </div>
  );

  // Render objects in selected category
  const renderObjects = () => {
    if (!selectedCategory) return null;
    
    return (
      <div>
        <button
          onClick={goBack}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.5rem 1rem',
            marginBottom: '1rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#666',
            fontSize: '1rem',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#333'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#666'}
        >
          ← Back to Categories
        </button>
        
        <h4 style={{ marginBottom: '1rem' }}>
          {selectedCategory.icon} {selectedCategory.name}
        </h4>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '1rem'
        }}>
          {selectedCategory.objects.map(obj => (
            <div
              key={obj.id}
              style={{
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '1rem',
                transition: 'all 0.2s'
              }}
            >
              <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{obj.name}</h5>
              <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.75rem' }}>
                {obj.type.toUpperCase()} • {(obj.size / 1024).toFixed(1)}KB
              </div>
              <button
                onClick={() => loadObject(obj)}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: loading ? '#ccc' : '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = '#45a049';
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = '#4caf50';
                }}
              >
                {loading ? 'Loading...' : '+ Add to Scene'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #dee2e6'
      }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Environment Objects</h2>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.8rem',
            cursor: 'pointer',
            color: '#6c757d',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            transition: 'all 0.2s ease',
            lineHeight: 1
          }}
          onMouseEnter={(e) => {
            e.target.style.background = '#e9ecef';
            e.target.style.color = '#495057';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'none';
            e.target.style.color = '#6c757d';
          }}
        >
          ×
        </button>
      </div>
      
      {/* Messages */}
      {error && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#ffebee',
          color: '#c62828',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}
      
      {successMessage && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#e8f5e9',
          color: '#2e7d32',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {successMessage}
        </div>
      )}
      
      {/* Human info */}
      {humanLoaded && humanInfo && (
        <div style={{
          padding: '0.75rem',
          marginBottom: '1rem',
          background: '#e3f2fd',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          <strong>👤 Human:</strong> {humanInfo.isRunning ? '🏃 Running' : '🚶 Walking'} at 
          X: {humanInfo.position[0].toFixed(1)}, 
          Z: {humanInfo.position[2].toFixed(1)}
        </div>
      )}
      
      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {currentView === 'categories' ? renderCategories() : renderObjects()}
      </div>
      
      {/* Refresh button */}
      <div style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid #e0e0e0'
      }}>
        <button
          onClick={scanEnvironment}
          disabled={isScanning}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: isScanning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            if (!isScanning) {
              e.currentTarget.style.background = '#e0e0e0';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f5f5f5';
          }}
        >
          {isScanning ? '⏳' : '🔄'} Refresh Objects
        </button>
      </div>
    </div>
  );
};

export default EnvironmentManager;