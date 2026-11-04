// vim: set filetype=javascript:
// protocol.test.js
/*
 * Copyright (c) 2026 James Leigh
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
import net from 'node:net';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Client from '../src/ib-tws-node.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Starts a fake TWS JSON API server that answers the initial "help" with a
 * minimal schema and hands each connected socket to the given callback.
 */
async function fakeJsonApi(onconnect) {
    const server = net.createServer(socket => {
        socket.setNoDelay(true);
        socket.setEncoding('utf8');
        socket.on('error', () => {});
        socket.once('data', async() => {
            socket.write('help\t"actions"\t"EClient"\n');
            socket.write('help\t"EClient"\t"reqIds"\n');
            socket.write('helpEnd\tnull\n');
            await onconnect(socket);
        });
    });
    await new Promise(ready => server.listen(0, '127.0.0.1', ready));
    return server;
}

test('event line split across two chunks', async() => {
    const server = await fakeJsonApi(async socket => {
        await pause(100);
        socket.write('error\t-1\t"1768779264095"\t2104\t"Market data farm ');
        await pause(100);
        socket.write('connection is OK:usfarm"\t""\n');
    });
    const client = await Client({
        jsonApiHost: '127.0.0.1',
        jsonApiPort: server.address().port,
        noLaunch: true
    });
    try {
        const args = await new Promise((resolve, reject) => {
            client.on('error', (...args) => resolve(args));
            setTimeout(() => reject(Error('No error event received')), 5000);
        });
        assert.deepEqual(args, [-1, "1768779264095", 2104, "Market data farm connection is OK:usfarm", ""]);
    } finally {
        client.kill();
        server.close();
    }
});
