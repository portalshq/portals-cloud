import { useEffect, useRef } from "react";

export const SagaWebGLEngine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const targetScriptId = 'saga-webgl-standalone-module';
    
    // Guard against duplicate injections during React 18 Strict Mode remounts
    if (document.getElementById(targetScriptId)) {
      console.debug('[SagaWebGLEngine] Script already present in document. Bypassing injection.');
      return;
    }

    console.debug('[SagaWebGLEngine] Initializing unmodified ES module injection.');
    
    const webglScriptElement = document.createElement('script');
    webglScriptElement.id = targetScriptId;
    webglScriptElement.type = 'module';
    webglScriptElement.src = './saga-webgl.js';
    
    webglScriptElement.onerror = (errorEvent) => {
      console.error('[SagaWebGLEngine] Critical failure: Unable to load external WebGL script.', errorEvent);
    };

    document.body.appendChild(webglScriptElement);

    return () => {
      console.debug('[SagaWebGLEngine] Component unmounting. Warning: Underlying WebGL context cannot be disposed due to module scoping.');
      const injectedScriptNode = document.getElementById(targetScriptId);
      if (injectedScriptNode) {
         injectedScriptNode.remove();
      }
    };
  }, []);

  return (
    // The exact HTML structure demanded by the script's configuration header
    <div ref={containerRef} className="fixed inset-0 z-(--z-webgl)">
      <canvas className="size-full"></canvas>
    </div>
  );
};