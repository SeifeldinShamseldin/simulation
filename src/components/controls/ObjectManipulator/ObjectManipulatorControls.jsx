import React, { useState, useEffect } from 'react';
import ObjectManipulator from '../../../core/Manipulator/ObjectManipulator';
import './ObjectManipulatorControls.css';

const ObjectManipulatorControls = ({ viewerRef }) => {
    const [enabled, setEnabled] = useState(false);
    const [mode, setMode] = useState('translate');
    const [space, setSpace] = useState('world');
    const [selectedObjects, setSelectedObjects] = useState([]);
    const [manipulator, setManipulator] = useState(null);
    
    // Initialize manipulator
    useEffect(() => {
        if (!viewerRef?.current) return;
        
        const sceneSetup = viewerRef.current.getSceneSetup();
        if (!sceneSetup) return;
        
        const newManipulator = new ObjectManipulator(
            sceneSetup.scene,
            sceneSetup.camera,
            sceneSetup.renderer,
            sceneSetup.controls
        );
        
        // Set callbacks
        newManipulator.onSelectionChange = (objects) => {
            setSelectedObjects(objects);
        };
        
        setManipulator(newManipulator);
        
        return () => {
            if (newManipulator) {
                newManipulator.dispose();
            }
        };
    }, [viewerRef]);
    
    // Toggle manipulator
    const toggleManipulator = () => {
        if (!manipulator) return;
        
        const newEnabled = !enabled;
        setEnabled(newEnabled);
        
        if (newEnabled) {
            manipulator.enable();
        } else {
            manipulator.disable();
        }
    };
    
    // Change mode
    const handleModeChange = (newMode) => {
        if (!manipulator || !enabled) return;
        
        setMode(newMode);
        manipulator.setMode(newMode);
    };
    
    // Change space
    const handleSpaceChange = (newSpace) => {
        if (!manipulator || !enabled) return;
        
        setSpace(newSpace);
        manipulator.setSpace(newSpace);
    };
    
    return (
        <div className="urdf-controls-section object-manipulator-controls">
            <h3>Object Manipulator</h3>
            
            <div className="manipulator-toggle">
                <button 
                    className={`toggle-btn ${enabled ? 'active' : ''}`}
                    onClick={toggleManipulator}
                >
                    {enabled ? '🔓 Manipulation Mode ON' : '🔒 Enable Manipulation'}
                </button>
            </div>
            
            {enabled && (
                <>
                    <div className="manipulator-modes">
                        <h4>Transform Mode</h4>
                        <div className="mode-buttons">
                            <button 
                                className={`mode-btn ${mode === 'translate' ? 'active' : ''}`}
                                onClick={() => handleModeChange('translate')}
                                title="Move (G)"
                            >
                                ↔️ Move
                            </button>
                            <button 
                                className={`mode-btn ${mode === 'rotate' ? 'active' : ''}`}
                                onClick={() => handleModeChange('rotate')}
                                title="Rotate (R)"
                            >
                                🔄 Rotate
                            </button>
                            <button 
                                className={`mode-btn ${mode === 'scale' ? 'active' : ''}`}
                                onClick={() => handleModeChange('scale')}
                                title="Scale (S)"
                            >
                                📐 Scale
                            </button>
                        </div>
                    </div>
                    
                    <div className="manipulator-space">
                        <h4>Coordinate Space</h4>
                        <div className="space-buttons">
                            <button 
                                className={`space-btn ${space === 'world' ? 'active' : ''}`}
                                onClick={() => handleSpaceChange('world')}
                            >
                                🌍 World
                            </button>
                            <button 
                                className={`space-btn ${space === 'local' ? 'active' : ''}`}
                                onClick={() => handleSpaceChange('local')}
                            >
                                📍 Local
                            </button>
                        </div>
                    </div>
                    
                    <div className="manipulator-info">
                        <h4>Selected Objects</h4>
                        {selectedObjects.length === 0 ? (
                            <p className="no-selection">No objects selected</p>
                        ) : (
                            <ul className="selected-list">
                                {selectedObjects.map((obj, index) => (
                                    <li key={index}>
                                        {obj.name || obj.robotName || `Object ${index + 1}`}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    
                    <div className="manipulator-help">
                        <h4>Keyboard Shortcuts</h4>
                        <ul className="shortcuts-list">
                            <li><kbd>G</kbd> - Move mode</li>
                            <li><kbd>R</kbd> - Rotate mode</li>
                            <li><kbd>S</kbd> - Scale mode</li>
                            <li><kbd>X/Y/Z</kbd> - Constrain to axis</li>
                            <li><kbd>Shift</kbd> - Multi-select</li>
                            <li><kbd>Esc</kbd> - Clear selection</li>
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
};

export default ObjectManipulatorControls;