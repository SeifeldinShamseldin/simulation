// src/contexts/hooks/useSceneObject.js
import { useSceneObject as useSceneObjectContext } from '../SceneObjectContext';

// Re-export the context hook with additional utilities
export const useSceneObject = () => {
  const context = useSceneObjectContext();
  
  // Quick add methods for common formats
  const addSTL = async (path, config = {}) => {
    return context.addObject({
      ...config,
      path,
      category: config.category || 'stl'
    });
  };
  
  const addGLTF = async (path, config = {}) => {
    return context.addObject({
      ...config,
      path,
      category: config.category || 'gltf'
    });
  };
  
  const addFromLibrary = async (libraryItem) => {
    return context.addObject({
      name: libraryItem.name,
      path: libraryItem.path,
      category: libraryItem.category,
      metadata: { libraryId: libraryItem.id }
    });
  };
  
  return {
    ...context,
    // Additional convenience methods
    addSTL,
    addGLTF,
    addFromLibrary
  };
};