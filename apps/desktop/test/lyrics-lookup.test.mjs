import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, '..', 'src', 'main', 'services', 'lyrics.ps1');

describe('LRCLIB bridge', () => {
  it('keeps the HTTPS host when adding the search query', { skip: process.platform !== 'win32' }, async () => {
    let requested = '';
    const server = createServer((request, response) => {
      requested = request.url;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify([
        {
          trackName: 'get me high',
          artistName: 'Marco Luka',
          duration: 105,
          syncedLyrics: '[00:10.18] Run right through my mind',
        },
      ]));
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address();
      const base64 = (value) => Buffer.from(value, 'utf8').toString('base64');
      const { stdout } = await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', script,
        '-TrackB64', base64('get me high'),
        '-ArtistB64', base64('marco luka'),
        '-AlbumB64', '',
        '-Duration', '16',
        '-BaseUrl', `http://127.0.0.1:${port}/api/search`,
      ], { timeout: 15000 });
      const payload = JSON.parse(stdout.trim());
      assert.equal(payload.ok, true);
      assert.equal(payload.candidates.length, 1);
      assert.equal(payload.candidates[0].trackName, 'get me high');
      assert.match(requested, /^\/api\/search\?track_name=get%20me%20high&artist_name=marco%20luka$/);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  it('uses the NetEase lyric catalogue for an exact track id', { skip: process.platform !== 'win32' }, async () => {
    let requested = '';
    const server = createServer((request, response) => {
      requested = request.url;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 200,
        lrc: {
          lyric: [
            '[00:01.00] 作词 : Artist',
            '[00:43.06] my songs will tell your story',
          ].join('\n'),
        },
      }));
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address();
      const base64 = (value) => Buffer.from(value, 'utf8').toString('base64');
      const { stdout } = await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', script,
        '-Provider', 'Netease',
        '-TrackId', '2724212430',
        '-TrackB64', base64('remember u'),
        '-ArtistB64', base64('fcj / Moon Jelly / Cat naps'),
        '-AlbumB64', '',
        '-Duration', '193.593',
        '-NeteaseBaseUrl', `http://127.0.0.1:${port}`,
      ], { timeout: 15000 });
      const payload = JSON.parse(stdout.trim());
      assert.equal(payload.ok, true);
      assert.equal(payload.source, 'netease');
      assert.equal(payload.candidates.length, 1);
      assert.match(payload.candidates[0].syncedLyrics, /\[00:43\.06\]/);
      assert.match(requested, /^\/api\/song\/lyric\?id=2724212430(?:&|$)/);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  it('searches NetEase when the media session has no catalogue id', { skip: process.platform !== 'win32' }, async () => {
    const requests = [];
    const server = createServer((request, response) => {
      requests.push(request.url);
      response.setHeader('content-type', 'application/json');
      if (request.url.startsWith('/api/search/get/web')) {
        response.end(JSON.stringify({
          code: 200,
          result: {
            songs: [{
              id: 2724212430,
              name: 'remember u',
              artists: [{ name: 'fcj' }, { name: 'Moon Jelly' }, { name: 'Cat naps' }],
              duration: 193593,
            }],
          },
        }));
        return;
      }
      response.end(JSON.stringify({
        code: 200,
        lrc: { lyric: '[00:43.06] my songs will tell your story' },
      }));
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address();
      const base64 = (value) => Buffer.from(value, 'utf8').toString('base64');
      const { stdout } = await run('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', script,
        '-Provider', 'Netease',
        '-TrackB64', base64('remember u'),
        '-ArtistB64', base64('fcj / Moon Jelly / Cat naps'),
        '-AlbumB64', '',
        '-Duration', '193.593',
        '-NeteaseBaseUrl', `http://127.0.0.1:${port}`,
      ], { timeout: 15000 });
      const payload = JSON.parse(stdout.trim());
      assert.equal(payload.ok, true);
      assert.equal(payload.source, 'netease');
      assert.equal(payload.candidates[0].trackName, 'remember u');
      assert.match(requests[0], /^\/api\/search\/get\/web\?/);
      assert.match(requests[1], /^\/api\/song\/lyric\?id=2724212430(?:&|$)/);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
});
