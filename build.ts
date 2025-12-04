import * as esbuild from 'esbuild';

async function build() {
  console.log('🚧 Building Worker...');
  // 1. 构建 Worker
  const workerBuild = await esbuild.build({
    entryPoints: ['src/worker/vision.ts'],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
  });
  const workerCode = workerBuild.outputFiles[0].text;

  console.log('🚧 Building Main Script...');
  // 2. 构建主脚本
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/BetterGi-Next.user.js',
    format: 'iife',
    loader: { '.css': 'text' }, // 允许直接 import css 字符串
    define: {
      '__WORKER_CODE__': JSON.stringify(workerCode)
    },
    banner: {
      js: `// ==UserScript==
// @name         BetterGi-Next (核心引擎 v2.0)
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  基于 Better-xCloud 的新一代自动化引擎
// @match        https://www.xbox.com/*/play*
// @grant        unsafeWindow
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==
`
    }
  });

  console.log('✅ Build Complete: dist/BetterGi-Next.user.js');
}

build();
