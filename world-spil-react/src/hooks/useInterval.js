import { useEffect, useRef } from 'react';

// Simple hook for setInterval that always uses latest callback
export default function useInterval(callback, delay) {
  const savedRef = useRef();
  useEffect(() => { savedRef.current = callback; }, [callback]);

  useEffect(() => {
    if (delay == null) return;
    function tick() { savedRef.current && savedRef.current(); }
    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
}