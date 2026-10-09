// Test contracts affect CI, but do not change a published Edge bundle.
const isTest = file => /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(file);
export function edgeRuntimeInventory(files) {
  const runtimeFiles = files.filter(file => !isTest(file));
  return {
    edgeFunctions: [...new Set(runtimeFiles.flatMap(file => {
      const match = file.match(/^supabase\/functions\/([^/]+)\//);
      return match && match[1] !== '_shared' ? [match[1]] : [];
    }))].sort(),
    sharedEdgeChanged: runtimeFiles.some(file => file.startsWith('supabase/functions/_shared/')),
  };
}
