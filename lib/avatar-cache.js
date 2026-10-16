const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

// Never expose this directory through express.static. Callers must authenticate
// and validate the account before asking for an avatar.
function createAvatarCache({ directory, ttl = 86400000, missingTtl = 300000, errorTtl = 30000, now = Date.now, onError = () => {} }) {
    const pending = new Map();
    const negative = new Map();

    function rememberMissing(key, duration) {
        if (negative.size >= 1000) negative.delete(negative.keys().next().value);
        negative.set(key, now() + duration);
    }

    function refresh(key, file, load) {
        if (pending.has(key)) return pending.get(key);
        const request = (async () => {
            let temporary;
            try {
                const data = await load();
                if (!Buffer.isBuffer(data) || !data.length) {
                    // Remove an old photo when Telegram reports it was deleted.
                    await fs.unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
                    rememberMissing(key, missingTtl);
                    return null;
                }
                await fs.mkdir(directory, { recursive: true, mode: 0o700 });
                temporary = `${file}.${randomUUID()}.tmp`;
                await fs.writeFile(temporary, data, { mode: 0o600 });
                await fs.rename(temporary, file);
                negative.delete(key);
                return data;
            } catch (error) {
                rememberMissing(key, errorTtl);
                throw error;
            } finally {
                if (temporary) await fs.unlink(temporary).catch(() => {});
            }
        })().finally(() => pending.delete(key));
        pending.set(key, request);
        return request;
    }

    return {
        async get(accountIdentity, peerId, load) {
            // Account indices shift when an account is deleted. Use a hashed,
            // stable account/session identity instead to prevent wrong avatars.
            const key = createHash('sha256').update(JSON.stringify([accountIdentity, String(peerId)])).digest('hex');
            const file = path.join(directory, `${key}.jpg`);
            const retryAt = negative.get(key) || 0;
            let data;
            let modified;
            try {
                const stat = await fs.stat(file);
                data = await fs.readFile(file);
                modified = stat.mtimeMs;
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            if (data && data.length) {
                if (now() - modified >= ttl && retryAt <= now()) {
                    // Return stale photos immediately while refreshing in the
                    // background. No extra Telegram request for each visitor.
                    refresh(key, file, load).catch(onError);
                }
                return data;
            }
            if (retryAt > now()) return null;
            negative.delete(key);
            return refresh(key, file, load);
        }
    };
}

module.exports = { createAvatarCache };
