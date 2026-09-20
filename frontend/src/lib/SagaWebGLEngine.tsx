'use client';

import { useEffect, useRef } from "react";

export const SagaWebGLEngine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupCalledRef = useRef(false);

  useEffect(() => {
    const targetScriptId = 'saga-webgl-standalone-module';
    
    // Guard against duplicate injections during React 18 Strict Mode remounts
    if (document.getElementById(targetScriptId)) {
      console.debug('[SagaWebGLEngine] Script already present in document. Bypassing injection.');
      return;
    }

    console.debug('[SagaWebGLEngine] Initializing WebGL engine with proper cleanup.');
    
    const webglScriptElement = document.createElement('script');
    webglScriptElement.id = targetScriptId;
    webglScriptElement.type = 'module';
    webglScriptElement.src = '/saga-webgl.js';
    
    webglScriptElement.onerror = (errorEvent) => {
      console.error('[SagaWebGLEngine] Critical failure: Unable to load external WebGL script.', errorEvent);
    };

    document.body.appendChild(webglScriptElement);

    return () => {
      if (cleanupCalledRef.current) {
        console.debug('[SagaWebGLEngine] Cleanup already called, skipping.');
        return;
      }
      
      cleanupCalledRef.current = true;
      console.debug('[SagaWebGLEngine] Component unmounting - cleaning up WebGL engine.');
      
      // Remove the script element
      const injectedScriptNode = document.getElementById(targetScriptId);
      if (injectedScriptNode) {
         injectedScriptNode.remove();
      }
      
      // Note: The saga-webgl.js script now handles its own cleanup via the bootstrap function
      // which disposes existing instances before creating new ones. This ensures per-page application.
    };
  }, []);

  return (
    // The exact HTML structure demanded by the script's configuration header
    <div ref={containerRef} className="saga-webgl-viewport fixed z-(--z-webgl)">
      <canvas className="size-full"></canvas>
    </div>
  );
};
