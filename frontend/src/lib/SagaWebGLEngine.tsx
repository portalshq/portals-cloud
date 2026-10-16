'use client';

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    __sagaWebGLCanvas?: HTMLCanvasElement;
  }
}

export const SagaWebGLEngine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const targetScriptId = 'saga-webgl-standalone-module';
    const container = containerRef.current;
    const canvas = container?.querySelector('canvas');
    if (!container || !canvas) return;

    const revealWebGL = () => {
      if (window.__sagaWebGLCanvas !== canvas) return;
      requestAnimationFrame(() => requestAnimationFrame(() => container.classList.add('is-ready')));
    };

    if (window.__sagaWebGLCanvas === canvas) revealWebGL();
    else window.addEventListener('saga-webgl-ready', revealWebGL);
    
    // Guard against duplicate injections during React 18 Strict Mode remounts
    if (document.getElementById(targetScriptId)) {
      console.debug('[SagaWebGLEngine] Script already present in document. Bypassing injection.');
      return () => window.removeEventListener('saga-webgl-ready', revealWebGL);
    }

    console.debug('[SagaWebGLEngine] Initializing unmodified ES module injection.');
    
    const webglScriptElement = document.createElement('script');
    webglScriptElement.id = targetScriptId;
    webglScriptElement.type = 'module';
    webglScriptElement.src = '/saga-webgl.js';
    
    webglScriptElement.onerror = (errorEvent) => {
      console.error('[SagaWebGLEngine] Critical failure: Unable to load external WebGL script.', errorEvent);
    };

    document.body.appendChild(webglScriptElement);

    return () => {
      window.removeEventListener('saga-webgl-ready', revealWebGL);
      console.debug('[SagaWebGLEngine] Component unmounting. Warning: Underlying WebGL context cannot be disposed due to module scoping.');
      const injectedScriptNode = document.getElementById(targetScriptId);
      if (injectedScriptNode) {
         injectedScriptNode.remove();
      }
    };
  }, []);

  return (
    // The exact HTML structure demanded by the script's configuration header
    <div ref={containerRef} className="saga-webgl-viewport fixed z-(--z-webgl)">
      <img className="saga-webgl-poster" src="/saga-webgl-poster.jpg" alt="" aria-hidden="true" />
      <canvas className="size-full"></canvas>
    </div>
  );
};
