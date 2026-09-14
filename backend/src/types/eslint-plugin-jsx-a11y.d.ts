// eslint-plugin-jsx-a11y ships no types. Only what patch/validate.ts uses.
declare module 'eslint-plugin-jsx-a11y' {
  const plugin: { flatConfigs: { strict: { rules: Record<string, unknown> } } };
  export default plugin;
}
