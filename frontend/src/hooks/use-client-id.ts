import { useState, useEffect } from "react";

const CLIENT_ID_KEY = "portals_client_id";

export function useClientId() {
  const [clientId, setClientId] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      // Use crypto.randomUUID if available, otherwise a simple fallback
      id = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    setClientId(id);
  }, []);

  return clientId;
}
