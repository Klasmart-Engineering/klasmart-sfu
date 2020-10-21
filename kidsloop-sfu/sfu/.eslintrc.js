module.exports = {
    env: {
        browser: true,
        es2020: true,
    },
    ignorePatterns: ["node_modules/"],
    extends: [
        "eslint:recommended",
        "plugin:react/recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaFeatures: {
            jsx: true,
        },
        ecmaVersion: 11,
        sourceType: "module",
    },
    plugins: [
        "react",
        "@typescript-eslint",
    ],
    rules: {
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-unused-vars": [
            1,
        ],
        "indent": [
            "error",
            4,
            { indentSwitchCase: false } // To prevent conflict with "editor.formatOnSave" in settings.json
        ],
        "linebreak-style": [
            "error",
            "unix",
        ],
        "quotes": [
            "error",
            "double",
        ],
        "react/display-name": [
            "off",
        ],
        "semi": [
            "error",
            "always",
        ],
    },
};
