export default [
  {
    input: './src/index-cjs.js',
    output: [
      {
        file: './dist/main.js',
        format: 'cjs',
        name: 'super-scaled-sockets-client',
      },
    ],
    external: ['jazzy-utility', 'sss-mongo-redis']
  },
  {
    input: 'src/index.js',
    output: [
      {
        file: './dist/module.js',
        format: 'esm',
        name: 'super-scaled-sockets-client'
      }
    ],
    external: ['jazzy-utility', 'sss-mongo-redis']
  }
];
