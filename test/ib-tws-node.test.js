
// vim: set filetype=javascript:
// ib-tws-node.test.js
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
import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import Client from '../src/ib-tws-node.js';

let client;

// npm test sets --test-timeout=1200000 (20 minutes) for human input

beforeEach(async() => {
    client = await Client({twsApiPort: 7496, twsApiHost: 'localhost'});
});

afterEach(async() => {
    await client.exit();
});

test('help', async() => {
    await new Promise((resolve, reject) => {
        client.on('help', (method, param, type) => {
            try {
                assert.ok(method);
                assert.ok(param);
                assert.ok(type);
            } catch (err) {
                reject(err);
            }
        }).on('helpEnd', resolve);
        client.help("placeOrder").catch(reject);
    });
});

test('error', async() => {
    const msg = await new Promise((resolve, reject) => {
        client.on('error', (reqId, time, code, msg, advancedOrderRejectJson) => resolve(msg));
        client.reqIds(-1).catch(reject);
    });
    assert.match(msg, /Not connected/);
});

test('param length', async() => {
    await assert.rejects(client.help());
});

test('param type', async() => {
    await assert.rejects(client.sleep("two"));
});

test('param int', async() => {
    await assert.rejects(client.calculateImpliedVolatility(34.6, {}, "34.0", 16, []));
});

test('param foo', async() => {
    await assert.rejects(client.calculateImpliedVolatility(34, {conid: 4, foo: 'bar'}, "34.0", 16, []));
});

test('param double', async() => {
    await assert.rejects(client.calculateImpliedVolatility(34, {}, "34b", 16, []));
});

test('param array', async() => {
    await assert.rejects(client.calculateImpliedVolatility(34, {}, "34.0", 16, {tag:'name',value:'value'}));
});

test('param calculateImpliedVolatility', async() => {
    client.on('error', (reqId, code, msg) => {});
    await client.calculateImpliedVolatility(34, {}, "34.0", 16, [{tag:'name',value:'value'}]);
});

test('param nested object', async() => {
    await assert.rejects(client.reqContractDetails(1, {deltaNeutralContract: 'bogus'}));
});

test('param enum', async() => {
    await assert.rejects(client.reqContractDetails(1, {secIdType: 'bogus'}));
});

test('param boolean', async() => {
    await assert.rejects(client.reqContractDetails(1, {includeExpired: 'yes'}));
    await assert.rejects(client.reqContractDetails(1, {includeExpired: 0}));
    await assert.rejects(client.reqContractDetails(1, {includeExpired: ''}));
    await client.reqContractDetails(1, {includeExpired: false});
});

test('requestFA Groups by number', async() => {
    await assert.rejects(client.requestFA(1));
});

test('requestFA Aliases by number', async() => {
    await assert.rejects(client.requestFA(3));
});

test('requestFA Groups', async() => {
    await client.requestFA('GROUPS');
});

test('requestFA Aliases', async() => {
    await client.requestFA('ALIASES');
});

test.skip('placeOrder', async() => {
    client.on('error', console.log);

    // TWS might need moment after enabling the API before it is ready to connect
    let nextValidId = await new Promise((ready, abort) => {
        client.on('error', (e_str_msg, code, msg) => !isFinite(e_str_msg) && abort(e_str_msg));
        client.once('nextValidId', ready);
        client.eConnect(1234, false).catch(abort);
    });

    const id = nextValidId++;

    // use await to throw parameter validation errors
    await client.placeOrder(id, {
        symbol:'AAPL',
        exchange: 'SMART',
        currency:'USD',
        secType:'STK'
    }, {
        action: 'BUY',
        totalQuantity: 1,
        orderType: 'MIDPRICE',
        transmit: false
    });
    const order_status = await new Promise((ready, abort) => {
        let order_status;
        client.on('error', (e_str_msg, code, msg) => !isFinite(e_str_msg) && abort(e_str_msg));
        client.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld, mktCapPrice) => {
            if (id == orderId) {
                order_status = status;
                if (~['ApiCancelled', 'Cancelled', 'Filled'].indexOf(status)) ready(orderId);
                else console.log(orderId, status, filled, lastFillPrice);
            }
        });
        setTimeout(() => ready(order_status), 1000);
        client.reqOpenOrders().catch(abort);
    });
});
