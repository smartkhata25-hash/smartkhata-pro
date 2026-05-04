// 📁 src/hooks/useFormPersist.js

import useAutoPersist from './useAutoPersist';

export default function useFormPersist(key, formState, setFormState) {
  return useAutoPersist(key, formState, setFormState);
}
