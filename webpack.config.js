/* eslint @typescript-eslint/no-var-requires: "off" */
const path = require("path");
const webpack = require("webpack");
const nodeExternals = require("webpack-node-externals");

module.exports = {
    mode: "development",
    target: "node",
    entry: "./src/v2/entry.ts",
    devtool: "source-map",
    module: {
        rules: [
            {
                test: /\.(j|t)s$/,
                exclude: /node_modules/,
                use: {
                    loader: "ts-loader"
                }
            },
        ]
    },
    resolve: {
        extensions: [".js", ".jsx", ".tsx", ".ts"]
    },
    output: {
        filename: "index.js",
        path: path.resolve(__dirname, "dist")
    },
    plugins: [
        new webpack.BannerPlugin(
            {
                banner: "require(\"source-map-support\").install();",
                raw: true,
                entryOnly: false
            },
        )
    ],
    externals: [nodeExternals({additionalModuleDirs: ["./types/**"]})],
};
