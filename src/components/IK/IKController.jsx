import React, { useEffect, useState } from 'react';

// Initialize target from current position ONLY ONCE
useEffect(() => {
  if (currentPosition && targetPosition.x === 0 && targetPosition.y === 0 && targetPosition.z === 0) {
    setTargetPosition({
      x: parseFloat(currentPosition.x) || 0,
      y: parseFloat(currentPosition.y) || 0,
      z: parseFloat(currentPosition.z) || 0
    });
  }
}, []); // Empty dependency array - only run once on mount

// Handle IK solving 