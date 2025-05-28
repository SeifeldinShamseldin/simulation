import React, { useState } from 'react';
import './FloorControls.css';

const FloorControls = ({ viewerRef }) => {
    const [opacity, setOpacity] = useState(0.8);
    const [showControls, setShowControls] = useState(false);
    
    const handleOpacityChange = (value) => {
        const newOpacity = parseFloat(value);
        setOpacity(newOpacity);
        
        if (viewerRef?.current) {
            const sceneSetup = viewerRef.current.getSceneSetup();
            if (sceneSetup) {
                sceneSetup.setGroundOpacity(newOpacity);
            }
        }
    };
    
    const presets = [
        { label: 'Invisible', value: 0 },
        { label: 'Glass', value: 0.3 },
        { label: 'Semi', value: 0.5 },
        { label: 'Default', value: 0.8 },
        { label: 'Solid', value: 1 }
    ];
    
    return (
        <div className="urdf-controls-section floor-controls">
            <div className="floor-controls-header">
                <h3>Floor Settings</h3>
                <button 
                    className="toggle-btn"
                    onClick={() => setShowControls(!showControls)}
                >
                    {showControls ? '−' : '+'}
                </button>
            </div>
            
            {showControls && (
                <div className="floor-controls-content">
                    <div className="opacity-control">
                        <label>Floor Transparency</label>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={opacity}
                            onChange={(e) => handleOpacityChange(e.target.value)}
                            className="opacity-slider"
                        />
                        <span className="opacity-value">{Math.round(opacity * 100)}%</span>
                    </div>
                    
                    <div className="preset-buttons">
                        {presets.map(preset => (
                            <button
                                key={preset.label}
                                className={`preset-btn ${opacity === preset.value ? 'active' : ''}`}
                                onClick={() => handleOpacityChange(preset.value)}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    
                    <div className="floor-info">
                        <p>Floor is always solid - objects cannot pass through even when transparent</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FloorControls; 