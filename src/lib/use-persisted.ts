import { useEffect, useState } from 'react';

const PREFIX = 'road-to-bis:';

export const usePersisted = <T,>(key: string, initial: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return initial;
      const parsed = JSON.parse(raw);
      // Objects are merged over the defaults so fields added later get their default value.
      const isPlainObject = typeof initial === 'object' && initial !== null && !Array.isArray(initial);
      return isPlainObject ? { ...initial, ...parsed } : parsed;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private mode); state still works for this session.
    }
  }, [key, value]);
  return [value, setValue] as const;
};
