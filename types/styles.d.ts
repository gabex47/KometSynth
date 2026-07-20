/**
 * TypeScript does not understand stylesheet side-effect imports on its own.
 * Next.js processes these files during bundling; this declaration makes that
 * contract explicit for editors and for noUncheckedSideEffectImports.
 */
declare module "*.css" {
  const classNames: Readonly<Record<string, string>>;
  export default classNames;
}
