export interface WebGLSupport {
  supported: boolean;
  reason?: string;
}

/** Cheap capability probe before we spin up a full renderer. */
export function detectWebGL(): WebGLSupport {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'No window object.' };
  }
  if (!('WebGLRenderingContext' in window)) {
    return { supported: false, reason: 'This browser has no WebGL implementation.' };
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    if (!gl) {
      return {
        supported: false,
        reason: 'WebGL is disabled or your GPU/driver is blocklisted.',
      };
    }
    return { supported: true };
  } catch (err) {
    return { supported: false, reason: (err as Error).message };
  }
}
