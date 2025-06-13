import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/businessRules.js',
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true
    },
    {
      file: 'dist/ajre-json-rules-engine.umd.js',
      format: 'umd',
      name: 'AjreJsonRulesEngine',
      sourcemap: true,
      exports: 'named',
    }
  ],
  plugins: [
    resolve(),
    commonjs()
  ]
  // Não defina 'external', para que object-path seja incluído no bundle
}; 