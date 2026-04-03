import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

interface UseDebouncedStateResult<T> {
  debouncedState: T;
  setState: Dispatch<SetStateAction<T>>;
  instantState: T;
  isPending: boolean;
}

export function useDebouncedState<T>(
  initialValue: T,
  delay: number
): UseDebouncedStateResult<T> {
  const [instantState, setInstantState] = useState<T>(initialValue);
  const [debouncedState, setDebouncedState] = useState<T>(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedState(instantState);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [instantState, delay]);

  const isPending = instantState !== debouncedState;

  return {
    debouncedState,
    setState: setInstantState,
    instantState,
    isPending,
  };
}