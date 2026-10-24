// Platforms and KPIs the user added themselves, remembered on this machine
// so they show up as suggestions the next time a client is onboarded.
const KEY = "pulse.library.v1";
const empty = () => ({ platforms: [], kpis: [] });

export function loadLibrary() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return {
      platforms: Array.isArray(v?.platforms) ? v.platforms : [],
      kpis: Array.isArray(v?.kpis) ? v.kpis : [],
    };
  } catch {
    return empty();
  }
}
const store = (lib) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(lib));
  } catch {
    /* storage unavailable: the item still works for this session */
  }
  return lib;
};
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function saveLibraryPlatform(name) {
  const lib = loadLibrary();
  if (!lib.platforms.some((p) => same(p, name)))
    lib.platforms.push(name.trim());
  return store(lib);
}
export function saveLibraryKpi(name, unit) {
  const lib = loadLibrary();
  if (!lib.kpis.some((k) => same(k.name, name)))
    lib.kpis.push({ name: name.trim(), unit });
  return store(lib);
}

export function removeLibraryKpi(name) {
  const lib = loadLibrary();
  lib.kpis = lib.kpis.filter((k) => !same(k.name, name));
  return store(lib);
}
