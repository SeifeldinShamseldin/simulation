// components/controls/IKController/IKController.jsx
import React, { useState, useEffect } from 'react';
import useTCP from '../../../contexts/hooks/useTCP';
import ikAPI from '../../../core/IK/API/IKAPI';
import tcpProvider from '../../../core/IK/TCP/TCPProvider';
import './IKController.css';

/**
 * Component for controlling Inverse Kinematics
 * Uses the useTCP hook for TCP position and movement
 */
const IKController = ({
  viewerRef, 
  onIKUpdate,
}) => {
  // Get TCP position and movement functions from hook
  const { tcpPosition, moveToPosition } = useTCP();
  
  // State for target position input fields
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [solverStatus, setSolverStatus] = useState('Ready to move robot');
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Auto-update the target position fields when TCP position changes
  useEffect(() => {
    if (!isAnimating && (!targetPosition.x && !targetPosition.y && !targetPosition.z)) {
      setTargetPosition(tcpPosition);
    }
  }, [tcpPosition, isAnimating, targetPosition]);

  // Clean up animation state on unmount
  useEffect(() => {
    return () => {
      // Clean up animation state when component unmounts
      if (isAnimating) {
        ikAPI.stopAnimation();
      }
    };
  }, [isAnimating]);
  
  // Add relative movement options
  const moveRelative = (axis, amount) => {
    const newTarget = { ...targetPosition };
    newTarget[axis] = parseFloat(targetPosition[axis]) + amount;
    setTargetPosition(newTarget);
    setSolverStatus(`Target updated: relative ${axis}${amount > 0 ? '+' : ''}${amount}`);
  };
  
  // Set target to current position
  const useCurrentPosition = () => {
    setTargetPosition({
      x: parseFloat(tcpPosition.x.toFixed(3)),
      y: parseFloat(tcpPosition.y.toFixed(3)),
      z: parseFloat(tcpPosition.z.toFixed(3))
    });
    setSolverStatus('Target set to current position');
  };
  
  // Handle input changes
  const handleInputChange = (axis, value) => {
    // Ensure input is a valid number
    const numValue = parseFloat(value);
    const newValue = isNaN(numValue) ? 0 : numValue;
    
    setTargetPosition(prev => ({
      ...prev,
      [axis]: newValue
    }));
  };
  
  /**
   * Move robot to target position using IK
   */
  const moveToTarget = async () => {
    if (!viewerRef?.current || isAnimating) return;
    
    try {
      setIsAnimating(true);
      setSolverStatus('Moving to target...');
      
      const robot = viewerRef.current.getCurrentRobot();
      if (!robot) throw new Error('Robot not available');

      const currentPos = tcpPosition;
      const targetPos = targetPosition;
      
      console.log('Current:', currentPos);
      console.log('Target:', targetPos);
      
      // Calculate distance for duration
      const dx = targetPos.x - currentPos.x;
      const dy = targetPos.y - currentPos.y;
      const dz = targetPos.z - currentPos.z;
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      // Dynamic duration based on distance (faster for short, slower for long)
      const duration = Math.min(Math.max(distance * 2000, 800), 3000); // 800ms to 3s
      
      console.log('Distance:', distance.toFixed(3), 'Duration:', duration);
      
      // Single smooth movement - NO STEPS!
      const success = await ikAPI.executeIK(robot, targetPos, {
        animate: true,
        duration: duration,
        maxIterations: 50,  // More iterations for better solution
        tolerance: 0.008,   // Tighter tolerance
        dampingFactor: 0.7  // Better damping
      });
      
      if (success) {
        setSolverStatus('Target reached!');
      } else {
        setSolverStatus('Could not reach target');
      }
      
    } catch (error) {
      console.error("Error moving to target:", error);
      setSolverStatus("Error: " + error.message);
    } finally {
      setIsAnimating(false);
    }
  };
  
  // Stop current animation
  const stopAnimation = () => {
    ikAPI.stopAnimation();
    setIsAnimating(false);
    setSolverStatus('Movement stopped');
  };
  
  // Reset the robot to home position
  const resetRobot = () => {
    if (!viewerRef?.current) return;
    
    try {
      stopAnimation();
      viewerRef.current.resetJoints();
      setSolverStatus('Robot reset to home position');
    } catch (error) {
      console.error("Error resetting robot:", error);
      setSolverStatus("Error resetting: " + (error.message || "Unknown error"));
    }
  };

  /**
   * Move robot incrementally to target position
   */
  const moveIncrementally = async () => {
    if (!viewerRef?.current || isAnimating) return;
    
    try {
      setIsAnimating(true);
      const robot = viewerRef.current.getCurrentRobot();
      if (!robot) throw new Error('Robot not available');

      const currentPos = tcpPosition;
      const targetPos = targetPosition;
      
      const dx = targetPos.x - currentPos.x;
      const dy = targetPos.y - currentPos.y;
      const dz = targetPos.z - currentPos.z;
      const totalDistance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      
      console.log('Moving distance:', totalDistance);
      
      if (totalDistance < 0.08) { // 8cm threshold
        // Single SMOOTH movement for short distances
        setSolverStatus('Moving to target...');
        
        await ikAPI.executeIK(robot, targetPos, {
          animate: true,           // SMOOTH animation
          duration: 2000,          // 2 second duration
          maxIterations: 30,
          tolerance: 0.01
        });
        
        setSolverStatus('Target reached!');
      } else {
        // Multiple SMOOTH movements for large distances
        const stepSize = 0.05; // 5cm steps
        const numSteps = Math.ceil(totalDistance / stepSize);
        
        console.log('Moving in', numSteps, 'smooth steps');
        
        for (let i = 1; i <= numSteps; i++) {
          const progress = i / numSteps;
          const stepTarget = {
            x: currentPos.x + dx * progress,
            y: currentPos.y + dy * progress,
            z: currentPos.z + dz * progress
          };
          
          setSolverStatus(`Smooth step ${i}/${numSteps}...`);
          
          // Each step is ANIMATED smoothly
          await ikAPI.executeIK(robot, stepTarget, {
            animate: true,           // SMOOTH for each step
            duration: 1000,          // 1 second per step
            maxIterations: 20,
            tolerance: 0.015
          });
          
          // Small pause between steps
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        setSolverStatus('Movement complete!');
      }
    } catch (error) {
      console.error("Error:", error);
      setSolverStatus("Error: " + error.message);
    } finally {
      setIsAnimating(false);
    }
  };

  return (
    <div className="urdf-controls-section ik-controller">
      <h3>Inverse Kinematics</h3>
      
      {/* Current TCP Position Display */}
      <div className="ik-current-position">
        <p><strong>Current End Effector Position:</strong></p>
        <div className="ik-position-grid">
          <div>
            <label>X</label>
            <div className="ik-position-value">{tcpPosition.x.toFixed(4)}</div>
          </div>
          <div>
            <label>Y</label>
            <div className="ik-position-value">{tcpPosition.y.toFixed(4)}</div>
          </div>
          <div>
            <label>Z</label>
            <div className="ik-position-value">{tcpPosition.z.toFixed(4)}</div>
          </div>
        </div>
      </div>
      
      {/* Target Position Inputs with Prominent UI */}
      <div className="ik-target-container">
        <div className="ik-target-header">
          <h4>MOVE ROBOT TO:</h4>
          <button
            className="ik-use-current-btn"
            onClick={useCurrentPosition}
          >
            Use Current Position
          </button>
        </div>
        
        <div className="ik-coordinates-grid">
          <div className="ik-coordinate-control">
            <label htmlFor="target-x">X Position:</label>
            <input
              id="target-x"
              className="ik-coordinate-input"
              type="number"
              step="0.01"
              value={targetPosition.x}
              onChange={(e) => handleInputChange('x', e.target.value)}
            />
            <div className="ik-increment-controls">
              <button 
                className="ik-increment-btn"
                onClick={() => moveRelative('x', -0.1)}
              >-0.1</button>
              <button 
                className="ik-increment-btn"
                onClick={() => moveRelative('x', 0.1)}
              >+0.1</button>
            </div>
          </div>
          <div className="ik-coordinate-control">
            <label htmlFor="target-y">Y Position:</label>
            <input
              id="target-y"
              className="ik-coordinate-input"
              type="number"
              step="0.01"
              value={targetPosition.y}
              onChange={(e) => handleInputChange('y', e.target.value)}
            />
            <div className="ik-increment-controls">
              <button 
                className="ik-increment-btn"
                onClick={() => moveRelative('y', -0.1)}
              >-0.1</button>
              <button 
                className="ik-increment-btn"
                onClick={() => moveRelative('y', 0.1)}
              >+0.1</button>
            </div>
          </div>
          <div className="ik-coordinate-control">
            <label htmlFor="target-z">Z Position:</label>
            <input
              id="target-z"
              className="ik-coordinate-input"
              type="number"
              step="0.01"
              value={targetPosition.z}
              onChange={(e) => handleInputChange('z', e.target.value)}
            />
            <div className="ik-increment-controls">
              <button 
                className="ik-increment-btn"
                onClick={() => moveRelative('z', -0.1)}
              >-0.1</button>
              <button 
                className="ik-increment-btn"
                onClick={() => moveRelative('z', 0.1)}
              >+0.1</button>
            </div>
          </div>
        </div>
        
        <button
          className="ik-move-btn"
          onClick={moveToTarget}
          disabled={isAnimating}
        >
          {isAnimating ? '⏳ Moving Robot...' : '🤖 Animate Joints'}
        </button>
        
        {isAnimating && (
          <button
            className="ik-stop-btn"
            onClick={stopAnimation}
          >
            Stop Animation
          </button>
        )}
      </div>
      
      {/* Status Display */}
      <div className="ik-status">
        <p>{solverStatus}</p>
      </div>
      
      {/* Home Position */}
      <div style={{ marginTop: '1rem' }}>
        <button
          className="ik-reset-btn"
          onClick={resetRobot}
        >
          Reset Robot to Home Position
        </button>
      </div>

      {/* Debug Button */}
      <div style={{ marginTop: '1rem' }}>
        <button 
          onClick={() => {
            console.log('=== DEBUG INFO ===');
            console.log('Current TCP Position:', tcpPosition);
            console.log('Target Position:', targetPosition);
            console.log('Robot:', viewerRef.current?.getCurrentRobot());
            
            // Test TCP calculation
            const robot = viewerRef.current?.getCurrentRobot();
            if (robot) {
              const tcpCalc = tcpProvider.calculateTCPPosition();
              console.log('TCP Provider calculated:', tcpCalc);
              
              const ikTcp = ikAPI.getCurrentTCPPosition();
              console.log('IK API TCP:', ikTcp);
            }
          }}
          style={{
            marginTop: '10px', 
            backgroundColor: '#ffa500',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Debug TCP
        </button>
      </div>
    </div>
  );
};

export default IKController;