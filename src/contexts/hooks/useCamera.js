import { useCameraContext } from '../CameraContext';
import useAnimate from './useAnimate';

// useCamera: ergonomic hook for camera access and controls
const useCamera = () => {
  const { isAnimating, animationProgress } = useAnimate();
  return useCameraContext();
}

export default useCamera; 