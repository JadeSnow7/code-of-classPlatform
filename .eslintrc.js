module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  // Workspace-level baseline. Prefer package-local ESLint configs (e.g. `frontend-react/eslint.config.js`).
  extends: ['eslint:recommended'],
};
