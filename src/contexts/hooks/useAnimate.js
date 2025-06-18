import { useContext } from 'react';
import AnimateContext from '../AnimateContext';

const useAnimate = () => {
  return useContext(AnimateContext);
};

export default useAnimate; 