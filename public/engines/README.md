# Motores opcionais

Esta pasta contém os bundles dos motores de renderização opcionais:

- `pixi.mjs` — PixiJS (sprites/partículas acelerados, WebGL/WebGPU)
- `phaser.mjs` — Phaser (cenas 2D e UI)
- `playcanvas.mjs` — PlayCanvas (visualizador 3D, WebGL2/WebGPU)
- `rapier2d.mjs` — Rapier (física 2D em WebAssembly)

Eles são carregados **sob demanda**, só quando a funcionalidade
correspondente é aberta. O jogo funciona normalmente sem eles.

Regerar com: `node scripts/build-engines.mjs`
