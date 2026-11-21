// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

const path = require('path');
module.exports = {
  mode: 'production',
  entry: './plugin.tsx',
  output: {path: path.resolve(__dirname, 'dist'), filename: 'main.js'},
  resolve: {extensions: ['.ts', '.tsx', '.js']},
  module: {rules: [{test: /\.tsx?$/, exclude: /node_modules/, use: 'ts-loader'}]},
  optimization: {minimize: true},
};
