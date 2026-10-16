const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createAvatarCache } = require('../lib/avatar-cache');

async function setup(t, options = {}) {
    const directory = await fs.mkdtemp('/tmp/opencode/avatar-cache-test-');
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    return { directory, cache: createAvatarCache({ directory, ...options }) };
}

test('deduplicates simultaneous downloads and persists across cache instances', async t => {
    const { directory, cache } = await setup(t);
    let calls = 0;
    const load = async () => { calls++; return Buffer.from('photo'); };
    const results = await Promise.all(Array.from({ length: 20 }, () => cache.get('session-a', 'me', load)));
    assert.equal(calls, 1);
    results.forEach(data => assert.equal(data.toString(), 'photo'));
    const restarted = createAvatarCache({ directory });
    assert.equal((await restarted.get('session-a', 'me', load)).toString(), 'photo');
    assert.equal(calls, 1);
    assert.equal((await fs.readdir(directory)).filter(file => file.endsWith('.tmp')).length, 0);
});

test('isolates accounts and peers, even with path-like input', async t => {
    const { directory, cache } = await setup(t);
    await cache.get('session-a', '../../me', async () => Buffer.from('a'));
    await cache.get('session-b', '../../me', async () => Buffer.from('b'));
    await cache.get('session-a', 'me', async () => Buffer.from('c'));
    const files = await fs.readdir(directory);
    assert.equal(files.length, 3);
    assert.ok(files.every(file => /^[a-f0-9]{64}\.jpg$/.test(file)));
    assert.equal((await cache.get('session-a', '../../me', () => assert.fail())).toString(), 'a');
});

test('missing photos and failures are retried only after their cooldown', async t => {
    let time = Date.now();
    const { cache } = await setup(t, { now: () => time, missingTtl: 100, errorTtl: 50 });
    let calls = 0;
    const missing = async () => { calls++; return null; };
    assert.equal(await cache.get('a', 'me', missing), null);
    assert.equal(await cache.get('a', 'me', missing), null);
    assert.equal(calls, 1);
    time += 101;
    await cache.get('a', 'me', missing);
    assert.equal(calls, 2);
    await assert.rejects(cache.get('b', 'me', async () => { throw new Error('offline'); }), /offline/);
    assert.equal(await cache.get('b', 'me', () => assert.fail()), null);
    time += 51;
    assert.equal((await cache.get('b', 'me', async () => Buffer.from('back'))).toString(), 'back');
});

test('stale photo is served immediately while refreshing in background', async t => {
    const { directory, cache } = await setup(t, { ttl: 100 });
    await cache.get('a', 'me', async () => Buffer.from('old'));
    const file = path.join(directory, (await fs.readdir(directory))[0]);
    await fs.utimes(file, new Date(0), new Date(0));
    let release;
    const fresh = new Promise(resolve => { release = resolve; });
    const load = () => fresh;
    assert.equal((await cache.get('a', 'me', load)).toString(), 'old');
    release(Buffer.from('new'));
    // Poll local asynchronous file completion, not any external process.
    for (let attempt = 0; attempt < 100; attempt++) {
        if ((await fs.readFile(file)).toString() === 'new') return;
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail('background refresh did not complete');
});
