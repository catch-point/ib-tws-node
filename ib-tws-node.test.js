
// vim: set filetype=javascript:
// ib-tws-node.test.js
/* 
 * Copyright (c) 2020 James Leigh
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
const Client = require('./ib-tws-node.js');
const mkdtemp = util.promisify(fs.mkdtemp);
const mkdir = util.promisify(fs.mkdir);

let tmp_dir;
let client;

beforeEach(async() => {
    await mkdir('tmp', {recursive: true});
    tmp_dir = await mkdtemp('tmp/ib-tws-node.test');
    client = await Client({silence: false, 'tws-settings-path': tmp_dir});
});

afterEach(async() => {
    await client.exit();
    deleteFolderRecursive(tmp_dir);
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

test.skip('login', done => {
    jest.setTimeout(60000); // 60 second timeout for human input
    client.on('login', state => {
        expect(state).toMatch(/TWO_FA_IN_PROGRESS|LOGGED_IN/);
        if (state == 'LOGGED_IN') done();
    });
    client.login();
});

test.skip('placeOrder', async() => {
    jest.setTimeout(120000); // 2 minutes timeout for human input
    client.on('error', console.log);
    await client.login("live", {}, {}); // opens TWS login window
    await client.enableAPI(7496, false); // enables API in Global Settings
    const port = await new Promise(cb => client.once('enableAPI', cb)); // API enabled

    // TWS might need moment after enabling the API before it is ready to connect
    let nextValidId = await new Promise((ready, abort) => {
        client.on('isConnected', connected => {
            if (!connected) {
                client.sleep(100).catch(abort);
                client.eConnect("localhost", port, 0, false).catch(abort);
                client.isConnected().catch(abort);
            }
        }).once('nextValidId', ready);
        client.isConnected().catch(abort);
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
        orderType: 'MIDPRICE'
    });
    const order_status = await new Promise((ready, abort) => {
        let order_status;
        client.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld, mktCapPrice) => {
            if (id == orderId) {
                order_status = status;
                if (~['ApiCancelled', 'Cancelled', 'Filled'].indexOf(status)) ready(orderId);
                else console.log(orderId, status, filled, lastFillPrice);
            }
        });
        setTimeout(() => ready(order_status), 10000);
        client.reqOpenOrders().catch(abort);
    });
});
