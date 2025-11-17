// Babel configuration for Jest + ESM + React
module.exports = {
  presets: [
    ['@babel/preset-env', { 
      targets: { node: 'current' }
    }],
    ['@babel/preset-react', { 
      runtime: 'automatic' 
    }]
  ]
};
