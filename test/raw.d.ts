// Vite/Vitest import fixtures as strings with ?raw; teach TypeScript about it.
declare module "*?raw" {
  const content: string;
  export default content;
}
