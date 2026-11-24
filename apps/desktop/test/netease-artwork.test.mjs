import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const artwork = require('../src/main/services/netease-artwork.js');

describe('NetEase artwork URL safety', () => {
  it('upgrades an approved NetEase CDN URL to HTTPS', () => {
    assert.equal(
      artwork.normalizeArtworkUrl('http://p1.music.126.net/cover.jpg?imageView=1'),
      'https://p1.music.126.net/cover.jpg?imageView=1',
    );
  });

  it('requests the 200px CDN rendition instead of a multi-megabyte original', () => {
    assert.equal(
      artwork.thumbnailUrl('http://p1.music.126.net/cover.jpg?imageView=1'),
      'https://p1.music.126.net/cover.jpg?imageView=1&param=200y200',
    );
  });

  it('refuses a host that only looks like the CDN', () => {
    for (const url of [
      'https://music.126.net.evil.example/cover.jpg',
      'https://evilmusic.126.net/cover.jpg',
      'file:///cover.jpg',
      'javascript:alert(1)',
    ]) {
      assert.equal(artwork.normalizeArtworkUrl(url), '', url);
    }
  });
});

describe('NetEase artwork resolution', () => {
  it('asks for the exact track and turns the album image into a data URL', async () => {
    const jsonCalls = [];
    const imageCalls = [];
    const resolver = artwork.createArtworkResolver({
      requestJson: async (url) => {
        jsonCalls.push(url);
        return {
          code: 200,
          songs: [
            {
              id: 42,
              album: { picUrl: 'http://p1.music.126.net/cover.jpg' },
            },
          ],
        };
      },
      requestImage: async (url) => {
        imageCalls.push(url);
        return { contentType: 'image/jpeg', bytes: Buffer.from('cover') };
      },
    });

    assert.equal(
      await resolver.resolve('42'),
      'data:image/jpeg;base64,Y292ZXI=',
    );
    assert.equal(jsonCalls.length, 1);
    assert.match(jsonCalls[0], /\/api\/song\/detail\/\?id=42&ids=%5B42%5D$/);
    assert.equal(imageCalls[0], 'https://p1.music.126.net/cover.jpg?param=200y200');

    assert.equal(
      await resolver.resolve('42'),
      'data:image/jpeg;base64,Y292ZXI=',
      'a resolved cover is reused for every once-per-second media frame',
    );
    assert.equal(jsonCalls.length, 1);
    assert.equal(imageCalls.length, 1);
  });

  it('does not accept a detail response for a different song', async () => {
    let imageCalls = 0;
    const resolver = artwork.createArtworkResolver({
      requestJson: async () => ({
        code: 200,
        songs: [
          {
            id: 7,
            album: { picUrl: 'https://p1.music.126.net/wrong.jpg' },
          },
        ],
      }),
      requestImage: async () => {
        imageCalls += 1;
        return { contentType: 'image/jpeg', bytes: Buffer.from('wrong') };
      },
    });
    assert.equal(await resolver.resolve('42'), '');
    assert.equal(imageCalls, 0);
  });

  it('refuses non-image and oversized downloads', async () => {
    const json = {
      code: 200,
      songs: [{ id: 42, album: { picUrl: 'https://p1.music.126.net/cover.jpg' } }],
    };
    const wrongType = artwork.createArtworkResolver({
      requestJson: async () => json,
      requestImage: async () => ({ contentType: 'text/html', bytes: Buffer.from('html') }),
    });
    assert.equal(await wrongType.resolve('42'), '');

    const tooLarge = artwork.createArtworkResolver({
      requestJson: async () => json,
      requestImage: async () => ({
        contentType: 'image/jpeg',
        bytes: Buffer.alloc(artwork.MAX_ARTWORK_BYTES + 1),
      }),
    });
    assert.equal(await tooLarge.resolve('42'), '');
  });

  it('caches a miss so an unavailable cover is not retried every second', async () => {
    let calls = 0;
    const resolver = artwork.createArtworkResolver({
      requestJson: async () => {
        calls += 1;
        return { code: 404, songs: [] };
      },
      requestImage: async () => null,
    });
    assert.equal(await resolver.resolve('42'), '');
    assert.equal(await resolver.resolve('42'), '');
    assert.equal(calls, 1);
  });

  it('retries a miss after the short negative-cache window', async () => {
    let clock = 0;
    let calls = 0;
    const resolver = artwork.createArtworkResolver({
      now: () => clock,
      negativeTtlMs: 100,
      requestJson: async () => {
        calls += 1;
        return { code: 404, songs: [] };
      },
      requestImage: async () => null,
    });
    assert.equal(await resolver.resolve('42'), '');
    clock = 101;
    assert.equal(await resolver.resolve('42'), '');
    assert.equal(calls, 2);
  });
});
