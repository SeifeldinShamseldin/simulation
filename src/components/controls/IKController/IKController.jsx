// components/controls/IKController/IKController.jsx
import React, { useState, useEffect } from 'react';
import { useRobotControl } from '../../../contexts/hooks/useRobotControl';
import useTCP from '../../../contexts/hooks/useTCP';
import ikAPI from '../../../core/IK/API/IKAPI';
import tcpProvider from '../../../core/IK/TCP/TCPProvider';

/**
 * Component for controlling Inverse Kinematics
 * Uses the useTCP hook for TCP position and movement
 */
const IKController = () => {
  const { activeRobotId, robot, isReady } = useRobotControl();
  const { tcpPosition, moveToPosition } = useTCP();
  
  // State for target position input fields
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0, z: 0 });
  const [solverStatus, setSolverStatus] = useState('Ready to move robot');
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Update TCP provider when robot changes
  useEffect(() => {
    if (robot && isReady) {
      tcpProvider.setRobot(robot);
    }
  }, [robot, isReady]);
  
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
    if (!isReady || isAnimating) return;
    
    try {
      setIsAnimating(true);
      setSolverStatus('Moving to target...');
      
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
    if (!robot) return;
    
    try {
      stopAnimation();
      robot.resetJoints();
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
    if (!isReady || isAnimating) return;
    
    try {
      setIsAnimating(true);
      
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

  if (!isReady) {
    return (
      <div className="controls-section">
        <h3 className="controls-section-title">Inverse Kinematics</h3>
        <p className="controls-text-muted">No robot loaded</p>
      </div>
    );
  }

  return (
    <div className="controls-section">
      <h3 className="controls-section-title">Inverse Kinematics - {activeRobotId}</h3>
      
      {/* Current TCP Position Display */}
      <div className="controls-group">
        <p className="controls-text-muted controls-mb-1"><strong>Current End Effector Position:</strong></p>
        <div className="controls-grid controls-grid-cols-3 controls-gap-sm controls-text-center">
          <div>
            <label className="controls-form-label">X</label>
            <div className="controls-form-control controls-text-center">{tcpPosition.x.toFixed(4)}</div>
          </div>
          <div>
            <label className="controls-form-label">Y</label>
            <div className="controls-form-control controls-text-center">{tcpPosition.y.toFixed(4)}</div>
          </div>
          <div>
            <label className="controls-form-label">Z</label>
            <div className="controls-form-control controls-text-center">{tcpPosition.z.toFixed(4)}</div>
          </div>
        </div>
      </div>
      
      {/* Target Position Inputs */}
      <div className="controls-group">
        <p className="controls-text-muted controls-mb-1"><strong>Target Position:</strong></p>
        <div className="controls-grid controls-grid-cols-3 controls-gap-sm">
          {['x', 'y', 'z'].map((axis) => (
            <div key={axis}>
              <label className="controls-form-label">{axis.toUpperCase()}</label>
              <input
                type="number"
                className="controls-form-control"
                value={targetPosition[axis]}
                onChange={(e) => handleInputChange(axis, e.target.value)}
                step="0.001"
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Relative Movement Controls */}
      <div className="controls-group">
        <p className="controls-text-muted controls-mb-1"><strong>Relative Movement:</strong></p>
        <div className="controls-grid controls-grid-cols-3 controls-gap-sm">
          {['x', 'y', 'z'].map((axis) => (
            <div key={axis} className="controls-d-flex controls-gap-2">
              <button
                className="controls-btn controls-btn-sm controls-btn-outline"
                onClick={() => moveRelative(axis, -0.01)}
              >
                -1cm
              </button>
              <button
                className="controls-btn controls-btn-sm controls-btn-outline"
                onClick={() => moveRelative(axis, 0.01)}
              >
                +1cm
              </button>
            </div>
          ))}
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="controls-group controls-d-flex controls-gap-2">
        <button
          className="controls-btn controls-btn-primary"
          onClick={moveToTarget}
          disabled={isAnimating}
        >
          Move to Target
        </button>
        <button
          className="controls-btn controls-btn-secondary"
          onClick={moveIncrementally}
          disabled={isAnimating}
        >
          Move Incrementally
        </button>
        <button
          className="controls-btn controls-btn-warning"
          onClick={stopAnimation}
          disabled={!isAnimating}
        >
          Stop
        </button>
        <button
          className="controls-btn controls-btn-outline"
          onClick={useCurrentPosition}
        >
          Use Current
        </button>
        <button
          className="controls-btn controls-btn-outline"
          onClick={resetRobot}
        >
          Reset
        </button>
      </div>
      
      {/* Status Display */}
      <div className="controls-group">
        <p className="controls-text-muted">
          <strong>Status:</strong> {solverStatus}
        </p>
      </div>
    </div>
  );
};

export default IKController;