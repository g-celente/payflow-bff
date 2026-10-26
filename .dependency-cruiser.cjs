// Architecture tests (run by `npm test`): Clean Architecture + Vertical Slice rules, the same as the Java services.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'src/domain only imports src/domain: no Express, no Node APIs, no npm packages.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { pathNot: '^src/domain' },
    },
    {
      name: 'slices-are-independent',
      comment: 'A feature slice never imports another slice.',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'features-receive-ports',
      comment: 'Slices never reach infrastructure; api/app.ts injects the clients as ports.',
      severity: 'error',
      from: { path: '^src/features' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'use-cases-are-framework-free',
      comment: 'handler.ts and ports.ts use only the domain: no Express, zod or Node APIs.',
      severity: 'error',
      from: { path: '^src/features/[^/]+/(handler|ports)\\.ts$' },
      to: { dependencyTypesNot: ['local', 'type-only'] },
    },
    {
      name: 'infrastructure-implements-ports-only',
      comment: 'Clients may implement slice ports, but never use routes, handlers or the api layer.',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/(api/|features/[^/]+/(route|handler)\\.ts$)' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js', '.d.ts'],
    },
  },
};
