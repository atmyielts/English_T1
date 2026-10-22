import { createServer } from 'node:http';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { scanNativeSamples } from './scan-academic-native-samples.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)), session = `academic-device-${randomUUID().slice(0, 8)}`;
const npx = [process.env.npm_execpath ? path.join(path.dirname(process.env.npm_execpath), 'npx-cli.js') : '', path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npx-cli.js')].find(value => value && existsSync(value));
assert.ok(npx, 'An installed npm/npx runtime is required.');
const bundle = await build({ stdin: { contents: "export {AnswerFileStore} from './packages/assessment-web/src/answer-file-store.ts';export {AcademicRecorder} from './packages/assessment-web/src/academic-recorder.ts';", resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'AcademicAnswerFixture', platform: 'browser', target: 'es2022' });
const server = createServer((req, res) => { res.setHeader('Cache-Control', 'no-store'); if (req.url === '/answer.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); } else if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><head><title>Local academic answer device verification</title></head><body><h1>Academic answer device verification</h1><p>Generated canvas only. No personal camera, microphone or screen is accessed.</p><script src="/answer.js"></script></body></html>'); } else { res.statusCode = 404; res.end(); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
async function cli(args) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [npx, '--yes', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '', error = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => error += c); child.on('error', reject); child.on('close', code => code === 0 ? resolve(output) : reject(new Error(error || output))); }); }
try { await cli(['open', `http://127.0.0.1:${server.address().port}`, '--browser', 'chrome']); await cli(['snapshot']); const result = await cli(['run-code', '--filename', 'scripts/answer-device-browser.js']), raw = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1]; assert.ok(raw, 'Native device browser did not return a completed proof.'); const {native_samples,...proof} = JSON.parse(raw); for (const required of ['encrypted_bytes', 'reload_recovery', 'prefix_replay', 'scope_isolation', 'conflict_fence', 'atomic_storage_failure', 'sealed_manifest', 'native_decode', 'native_audio_decode', 'track_shutdown', 'storage_failure_stops', 'interrupted_prefix', 'full_document_reload', 'encoder_startup_failure']) assert.equal(proof[required], true, required); const native_scanner=process.argv.includes('--scanner')?await scanNativeSamples(native_samples,root):undefined;console.log(JSON.stringify({ event: 'academic.answer.device.acceptance', ...proof,...(native_scanner?{native_scanner}:{}) })); }
finally { try { await cli(['close']); } catch {} await new Promise(resolve => server.close(resolve)); }
