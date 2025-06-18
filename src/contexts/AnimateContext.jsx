import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import EventBus from '../utils/EventBus';

const AnimateContext = createContext();

export const AnimateProvider = ({ children }) => {
  const [isAnimating, setIsAnimating] = useState(new Map()); // Map by entityId
  const [animationProgress, setAnimationProgress] = useState(new Map());

  // Start animation for an entity (robot, human, etc.)
  const startAnimation = useCallback((entityId) => {
    setIsAnimating(prev => new Map(prev).set(entityId, true));
    setAnimationProgress(prev => new Map(prev).set(entityId, 0));
    EventBus.emit('animation:start', { entityId });
  }, []);

  // Stop animation for an entity
  const stopAnimation = useCallback((entityId) => {
    setIsAnimating(prev => new Map(prev).set(entityId, false));
    setAnimationProgress(prev => new Map(prev).set(entityId, 0));
    EventBus.emit('animation:stop', { entityId });
  }, []);

  // Animate to values (stub, to be implemented by consumers)
  const animateToValues = useCallback((entityId, targetValues, options = {}) => {
    // This function should be implemented by consumers or extended for specific logic
    EventBus.emit('animation:to-values', { entityId, targetValues, options });
  }, []);

  // Listen for animation progress events
  React.useEffect(() => {
    const unsub = EventBus.on('animation:progress', ({ entityId, progress }) => {
      setAnimationProgress(prev => new Map(prev).set(entityId, progress));
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({
    isAnimating,
    animationProgress,
    startAnimation,
    stopAnimation,
    animateToValues
  }), [isAnimating, animationProgress, startAnimation, stopAnimation, animateToValues]);

  return (
    <AnimateContext.Provider value={value}>
      {children}
    </AnimateContext.Provider>
  );
};

export const useAnimateContext = () => {
  const context = useContext(AnimateContext);
  if (!context) throw new Error('useAnimateContext must be used within AnimateProvider');
  return context;
};

export default AnimateContext; 