#!/usr/bin/env node
// vim: set filetype=javascript:
// ib-tws-node/postinstall.js
/* 
 * Copyright (c) 2020-2026 James Leigh
 * 
 * This program is free software: you can redistribute it and/or modify  
 * it under the terms of the GNU General Public License as published by  
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but 
 * WITHOUT ANY WARRANTY; without even the implied warranty of 
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU 
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License 
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const MAX_REDIRECTS = 10;

main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
});

/**
 * Downloads each binary-dependency, verifying its sha256 checksum.
 * Each entry is "file": {"url": "...", "sha256": "..."}
 */
async function main() {
    const downloads = pkg['binary-dependencies'] || {};
    for (const [filename, {url, sha256}] of Object.entries(downloads)) {
        if (!url || !/^[0-9a-f]{64}$/i.test(sha256 || '')) {
            throw Error(`binary-dependencies["${filename}"] needs a url and a sha256 checksum`);
        }
        const file = path.resolve(__dirname, filename);
        if (await hashFile(file).catch(() => null) === sha256.toLowerCase()) {
            console.log(file, 'is up to date');
            continue;
        }
        console.log(url, '->', file);
        await fs.promises.mkdir(path.dirname(file), {recursive: true});
        const tmp = `${file}.${process.pid}.download`;
        try {
            const actual = await download(url, tmp);
            if (actual !== sha256.toLowerCase()) {
                throw Error(`Checksum mismatch for ${url}: expected sha256 ${sha256}, got ${actual}`);
            }
            await fs.promises.rename(tmp, file);
        } finally {
            await fs.promises.rm(tmp, {force: true});
        }
    }
}

/**
 * Saves the url to file, following redirects, and resolves to its sha256 hex digest
 */
function download(url, file, redirects = 0) {
    return new Promise((resolve, reject) => {
        https.get(url, response => {
            const {statusCode, headers} = response;
            if (300 <= statusCode && statusCode < 400 && headers.location) {
                response.resume();
                if (redirects >= MAX_REDIRECTS) {
                    reject(Error(`Too many redirects downloading ${url}`));
                } else {
                    const next = new URL(headers.location, url).href;
                    resolve(download(next, file, redirects + 1));
                }
            } else if (statusCode !== 200) {
                response.resume();
                reject(Error(`Download failed with HTTP ${statusCode} ${response.statusMessage}: ${url}`));
            } else {
                const hash = crypto.createHash('sha256');
                const out = fs.createWriteStream(file);
                response.on('data', chunk => hash.update(chunk));
                response.on('error', reject);
                out.on('error', reject);
                out.on('finish', () => resolve(hash.digest('hex')));
                response.pipe(out);
            }
        }).on('error', reject);
    });
}

/**
 * Resolves to the sha256 hex digest of an existing file
 */
function hashFile(file) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(file)
            .on('error', reject)
            .on('data', chunk => hash.update(chunk))
            .on('end', () => resolve(hash.digest('hex')));
    });
}
