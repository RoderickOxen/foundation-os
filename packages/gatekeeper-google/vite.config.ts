// Vite+ per-package settings. The build:configurator task definition is shared by all gatekeepers
// with a configurator UI and living beside the builder it runs; `withTests` is that config plus
// the shared vitest `test` task.
export { withTests as default } from '../../scripts/gatekeeper-configurator-vite-config.js'
