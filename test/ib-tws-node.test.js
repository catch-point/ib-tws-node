
// vim: set filetype=javascript:
// ib-tws-node.test.js
/* 
 * Copyright (c) 2020-2023 James Leigh
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
'use strict';

const util = require('util');
const fs = require('fs');
const path = require('path');
const Client = require('../src/ib-tws-node.js');
const mkdtemp = util.promisify(fs.mkdtemp);
const mkdir = util.promisify(fs.mkdir);

let client;

jest.setTimeout(1200000); // 2 minutes timeout for human input

beforeEach(async() => {
    client = await Client({'tws-port': 7496, 'tws-host': 'localhost'});
});

afterEach(async() => {
    await client.exit();
});

function deleteFolderRecursive(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function(file,index){
            try {
                var curPath = path + "/" + file;
                if(fs.lstatSync(curPath).isDirectory()) {
                    deleteFolderRecursive(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            } catch(e) {} // likely already deleted
        });
        fs.rmdirSync(path);
    }
}

test('help', done => {
    client.on('help', (method, param, type) => {
        expect(method).toBeTruthy();
        expect(param).toBeTruthy();
        expect(type).toBeTruthy();
    }).on('helpEnd', () => {
        done();
    });
    client.help("placeOrder");
});

test('error', done => {
    client.on('error', (reqId, code, msg) => {
        expect(msg).toContain('Not connected');
        done();
    });
    client.reqIds(-1);
});

test('param length', async() => {
    await expect(client.help()).rejects.toThrow();
});

test('param type', async() => {
    await expect(client.sleep("two")).rejects.toThrow();
});

test('param faMsgTypeName', async() => {
    await expect(client.faMsgTypeName("")).rejects.toThrow();
});

test('param int', async() => {
    await expect(client.calculateImpliedVolatility(34.6, {}, "34.0", 16, [])).rejects.toThrow();
});

test('param foo', async() => {
    await expect(client.calculateImpliedVolatility(34, {conid: 4, foo: 'bar'}, "34.0", 16, [])).rejects.toThrow();
});

test('param double', async() => {
    await expect(client.calculateImpliedVolatility(34, {}, "34b", 16, [])).rejects.toThrow();
});

test('param array', async() => {
    await expect(client.calculateImpliedVolatility(34, {}, "34.0", 16, {tag:'name',value:'value'})).rejects.toThrow();
});

test('param calculateImpliedVolatility', async() => {
    client.on('error', (reqId, code, msg) => {});
    await client.calculateImpliedVolatility(34, {}, "34.0", 16, [{tag:'name',value:'value'}]);
});

test('param nested object', async() => {
    await expect(client.reqContractDetails(1, {deltaNeutralContract: 'bogus'})).rejects.toThrow();
});

test('param enum', async() => {
    await expect(client.reqContractDetails(1, {secIdType: 'bogus'})).rejects.toThrow();
});

test('param boolean', async() => {
    await expect(client.reqContractDetails(1, {includeExpired: 'yes'})).rejects.toThrow();
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
