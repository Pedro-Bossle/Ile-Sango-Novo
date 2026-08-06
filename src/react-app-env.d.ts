/// <reference types="react-scripts" />

interface LenisLike {
  scrollTo?: (target: number, opts?: { duration?: number; immediate?: boolean }) => void;
  stop?: () => void;
  start?: () => void;
  scroll?: number;
  on?: (event: string, cb: () => void) => void;
  destroy?: () => void;
  raf?: (time: number) => void;
}

interface Window {
  __lenis?: LenisLike | null;
}
