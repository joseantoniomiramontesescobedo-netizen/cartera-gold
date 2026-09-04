// Reemplaza la API window.storage (disponible solo dentro de Claude) por una
// versión que guarda los datos en el propio dispositivo, usando localStorage.
// Mismo contrato: get/set/delete devuelven {key, value, shared} | null; list
// devuelve {keys, prefix, shared}. Así el componente Cartera no necesita
// cambios en su lógica de guardado/lectura.

const NAMESPACE = "cartera-gold:";

function fullKey(key, shared) {
  return NAMESPACE + (shared ? "shared:" : "priv:") + key;
}

function safeGetAllKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NAMESPACE)) out.push(k);
  }
  return out;
}

const storage = {
  async get(key, shared = false) {
    try {
      const raw = localStorage.getItem(fullKey(key, shared));
      if (raw === null) return null;
      return { key, value: raw, shared };
    } catch (e) {
      return null;
    }
  },

  async set(key, value, shared = false) {
    try {
      localStorage.setItem(fullKey(key, shared), value);
      return { key, value, shared };
    } catch (e) {
      // Cuota llena u otro error de almacenamiento local
      return null;
    }
  },

  async delete(key, shared = false) {
    try {
      localStorage.removeItem(fullKey(key, shared));
      return { key, deleted: true, shared };
    } catch (e) {
      return null;
    }
  },

  async list(prefix = "", shared = false) {
    try {
      const marker = NAMESPACE + (shared ? "shared:" : "priv:") + prefix;
      const keys = safeGetAllKeys()
        .filter((k) => k.startsWith(marker))
        .map((k) => k.slice((NAMESPACE + (shared ? "shared:" : "priv:")).length));
      return { keys, prefix, shared };
    } catch (e) {
      return null;
    }
  },
};

if (typeof window !== "undefined" && !window.storage) {
  window.storage = storage;
}

export default storage;
