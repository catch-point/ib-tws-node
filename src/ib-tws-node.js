// vim: set filetype=javascript:
// ib-tws-node.js
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
const net = require('net');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const assert = require('assert').strict;
const ib_tws_json = require('./ib-tws-json.js');
const HOME = require('os').homedir();
const realpath = util.promisify(fs.realpath);
const readFile = util.promisify(fs.readFile);
const access = util.promisify(fs.access);
const readdir = util.promisify(fs.readdir);

module.exports = createInstanceAsync;
module.exports.logger = console;

/**
 * Async factory function to create a new client object
 */
async function createInstanceAsync(settings) {
    const self = new EventEmitter();
    const onerror = err => self.emit('error', err);
    const shell = await createShell(settings);
    const schema = {};
    const finished = () => shell.destroyed || shell.killed;
    shell.on('close', () => {
        Object.keys(schema).forEach(key => {
            const item = schema[key];
            delete schema[key];
            while (item && !item.complete && item.listeners.length) {
                item.listeners.shift()();
            }
        });
        self.emit('exit');
    }).on('error', onerror);
    self.kill = signal => shell.destroy();
    self.ref = () => shell.ref();
    self.unref = () => shell.unref();
    let buffer = '';
    shell.on('data', chunk => {
        try {
            const lines = (buffer ? `buffer${chunk}` : chunk).split('\n');
            lines.forEach((line, i) => {
                if (i == lines.length -1) buffer = line;
                else emit_line(self, line);
            });
        } catch(err) {
            module.exports.logger.error(chunk);
            self.emit('error', err);
        }
    });
    self.on('help', (method_or_type, name, type, default_value) => {
        if (type) {
            if (schema[method_or_type].object_properties) schema[method_or_type].object_properties[name] = type;
            if (schema[method_or_type].object_values) schema[method_or_type].object_values[name] = default_value;
            if (schema[method_or_type].param_names) schema[method_or_type].param_names.push(name);
            if (schema[method_or_type].param_types) schema[method_or_type].param_types.push(type);
            const type_name = type.charAt(0) == '[' ? type.substring(1, type.length-1) : type;
            if (!schema[type_name]) {
                schema[type_name] = {
                    type_name,
                    values: [],
                    object_properties: {},
                    object_values: {},
                    listeners: [],
                    requested: false,
                    complete: false
                };
            }
        } else if (schema[method_or_type] && schema[method_or_type].action_type) {
            const action_name = name;
            const item = schema[action_name] = schema[action_name] || {
                action_name,
                param_names: [],
                param_types: [],
                listeners: [],
                requested: false,
                complete: false
            };
            Object.assign(self, {
                async [item.action_name]() {
                    if (!finished()) {
                        await completeItem(shell, schema, item.action_name);
                        const param_values = Array.prototype.slice.call(arguments);
                        if (!finished() && param_values.length != item.param_types.length) {
                            assert.fail(`Incorrect parameters ${JSON.stringify(param_values)} for ${item.action_name}(${item.param_types.join(',')})`)
                        }
                        await Promise.all(item.param_types.map(async(param_type, i) => {
                            await assertType(shell, schema, param_type, param_values[i]);
                        }));
                        if (!finished()) await send(shell, item.action_name, param_values);
                    }
                    if (!finished() || item.action_name == 'exit') {
                        return self;
                    } else if (item.action_name == 'isConnected') {
                        self.emit('isConnected', false);
                        return self;
                    } else {
                        throw Error(`ib-tws-json has closed and cannot call ${item.action_name}`);
                    }
                }
            });
        } else if (method_or_type == "actions") {
            schema[name] = schema[name] || {
                action_type: name,
                values: [],
                listeners: [],
                requested: false,
                complete: false
            };
        } else if (method_or_type == "events") {
            schema[name] = schema[name] || {
                event_type: name,
                values: [],
                listeners: [],
                requested: false,
                complete: false
            };
        } else if (schema[method_or_type]) {
            schema[method_or_type].values.push(name);
        }
    }).on('helpEnd', method_or_type => {
        const item = schema[method_or_type];
        if (item) {
            item.complete = true;
            while (item.listeners.length) {
                item.listeners.shift()();
            }
        }
    });
    return new Promise((ready, fail) => {
        self.once('exit', code => fail(Error(`Could not start ib-tws-json exit with code ${code}`)));
        self.once('error', err => typeof err == 'object' && fail(err));
        self.once('helpEnd', ready);
        if (finished()) fail(Error("Could not start ib-tws-json"));
        else send(shell, 'help', []).catch(fail);
    }).then(() => self);
}

/**
 * Creates a socket or socket-like option to communicate with TWS over ib-tws-json
 */
async function createShell(settings) {
    const json_port_offset = +settings['jsonApiPortOffset'] || 100;
    const tws_ports = settings['twsApiHost'] ? [] : +settings['twsApiPort'] ? [+settings['twsApiPort']] :
        [4002,7497,4001,7496];
    const tws_port = +settings['twsApiPort'] || !settings['twsApiHost'] && await scanLocalPorts(tws_ports);
    const tws_host = settings['twsApiHost'] || null;
    const json_ports = settings['jsonApiHost'] ? [] : +settings['jsonApiPort'] ? [+settings['jsonApiPort']] :
        tws_ports.map(port=>json_port_offset+port);
    const json_port = +settings['jsonApiPort'] || +settings['twsApiPort'] && json_port_offset+settings['twsApiPort'] ||
        !settings['jsonApiHost'] && await scanLocalPorts(json_ports);
    const json_host = settings['jsonApiHost'] || tws_host;
    if (json_port) {
        const json_socket = await openSocket(json_host, json_port).catch(e=>null);
        if (json_socket) return json_socket;
    }
    if (tws_port && !settings['jsonApiPort']) {
        // check if local tws port in use to see if we need to launch TWS first
        const inused = !tws_host && await scanLocalPorts([tws_port]);
        if (tws_host || inused) {
            // try json_port again (maybe it was just starting up)
            const json_socket = json_port && await openSocket(json_host, json_port).catch(e=>null);
            if (json_socket) return json_socket;
            // create a stand-alone ib-tws-json client to connect to TWS
            return standAloneJsonShell(tws_port, settings);
        }
    }
    if (!settings['noLaunch'] && !json_host && !settings['interactive'] && !settings['noPrompt']) {
        // launch TWS using ib-tws-json
        await launchTws(json_port_offset, settings);
        // wait for local json port to come online
        if (await waitForLocalPorts(json_ports, settings)) {
            return createShell({...settings, 'noLaunch': true});
        } else {
            throw Error(`ib-tws-node could not launch IBKR TWS on ${json_ports.join(', ')}`);
        }
    } else if (json_port) {
        throw Error(`ib-tws-node could not connect to ${json_host}:${json_port}`);
    } else {
        throw Error(`Could not connect to IBKR TWS API, make sure it is running and able to login`);
    }
}

/**
 * Opens a remote socket and waits until it is connected
 */
async function openSocket(host, port) {
    return new Promise(ready => {
        const socket = net.createConnection(port, host);
        socket.setEncoding('utf8');
        socket.once('connect', () => ready(socket));
        socket.once('error', () => ready(null));
    });
}

/**
 * Launch ib-tws-json in stand alone mode to communicate with TWS API
 */
async function standAloneJsonShell(tws_port, settings) {
    const process = await ib_tws_json({
        'interactive': true,
        'no-prompt': true,
        'launcher': settings.launcher,
        'tws-api-path': settings.twsApiPath,
        'tws-api-jar': settings.twsApiJar,
        'tws-api-port': tws_port,
        'tws-api-host': settings.twsApiHost,
        'java-home': settings.javaHome,
        'env': settings.env
    });
    process.destroy = () => process.kill();
    process.on('exit', () => process.emit('close'));
    process.write = data => process.stdin.write(data);
    process.end = data => process.stdin.end(data);
    process.stdin.on('error', e => process.emit('error', e));
    process.stdin.on('drain', () => process.emit('drain'));
    process.stderr.setEncoding('utf8');
    process.stderr.on('error', e => process.emit('error', e));
    process.stderr.on('data', module.exports.logger.error);
    process.stdout.setEncoding('utf8');
    process.stdout.on('error', e => process.emit('error', e));
    process.stdout.on('data', chunk => process.emit('data', chunk));
    return process;
}

/**
 * Repeatedly scans the given ports until settings.timeout is reached or a port is in use
 */
async function waitForLocalPorts(ports, settings) {
    let ms = 1000;
    const end = Date.now() + (settings['timeout']||120000); // 2min timeout for two factor login
    while (Date.now() < end) {
        await new Promise(cont => setTimeout(cont, ms+=ms));
        const port = await ports.reduce(async(memo, port) => {
            const socket = await openSocket(null, port);
            if (!socket) return memo;
            socket.destroy();
            return port;
        }, 0);
        if (port) return port;
    }
    return 0;
}

/**
 * Scans the given ports and returns a port that is in use or 0
 */
async function scanLocalPorts(ports) {
    return ports.reduce(async(memo, port) => {
        if (await memo) return memo;
        else return new Promise(done => {
            const server = net.createServer({ pauseOnConnect: true });
            server.once('listening', () => {
                done(memo); // not is use
                server.close();
            });
            server.once('error', e => {
                if (e.code == 'EADDRINUSE') done(port);
                else done(memo); // security error?
                server.close();
            });
            server.listen(port);
        });
    }, 0);
}

/**
 * Tells ib-tws-json to launch TWS with the JSON API extension
 */
async function launchTws(json_port_offset, settings) {
    const process = await ib_tws_json({
        'launch': true,
        'launcher': settings.launcher,
        'tws-api-path': settings.twsApiPath,
        'tws-api-jar': settings.twsApiJar,
        'tws-api-port': settings.twsApiPort,
        'tws-api-host': settings.twsApiHost,
        'json-api-port': settings.jsonApiPort,
        'json-api-port-offset': json_port_offset,
        'json-api-inet': settings.jsonApiInet || settings.jsonApiHost,
        'jts-exe-name': settings.jtsExeName,
        'jts-install-dir': settings.jtsInstallDir,
        'jts-config-dir': settings.jtsConfigDir,
        'java-home': settings.javaHome,
        'env': settings.env
    });
    process.stdin.destroy();
    process.stderr.setEncoding('utf8');
    process.stderr.on('error', module.exports.logger.error);
    process.stderr.on('data', module.exports.logger.error);
    process.stdout.setEncoding('utf8');
    process.stdout.on('error', module.exports.logger.error);
    process.stdout.on('data', module.exports.logger.error);
    await process.connected && new Promise(ready => process.once('exit', ready));
}

/**
 * Parses the line from the shell and emits the event
 */
function emit_line(emitter, line) {
    const record = line.match(/^\s*(\S+)\s+([\S\s]*)$/);
    const name = record && record[1] || line;
    const args = record ? record[2].split('\t').map(json => {
        try {
            return JSON.parse(json);
        } catch (e) {
            return json;
        }
    }) : [];
    return emitter.emit(name, ...args);
}

/**
 * Checks and waits for the remote help info to be available for the given item in the schema
 */
async function completeItem(shell, schema, name) {
    const item_name = name.charAt(0) == '[' ? name.substring(1, name.length-1) : name;
    const item = schema[item_name];
    if (item && !item.complete) {
        await new Promise((ready, fail) => {
            if (item.complete) return ready();
            item.listeners.push(ready);
            if (!item.requested) {
                item.requested = true;
                send(shell, 'help', [item.action_name || item.type_name]).catch(fail);
            }
        });
    }
    return item;
}

/**
 * Formats the call and args and sends them to the shell
 */
async function send(shell, call_name, args) {
    const call = [call_name].concat(args.map(arg => JSON.stringify(arg))).concat('\n');
    const room = shell.write(call.join('\t'));
    if (call_name == 'exit') return new Promise(cb => shell.once('close', cb));
    if (!room) return new Promise(cb => shell.once('drain', cb));
}

/**
 * Checks that param_value conforms the given schema param_type
 */
async function assertType(shell, schema, param_type, param_value) {
    const type = await completeItem(shell, schema, param_type);
    if (!type) {
        return; // shell has already exited
    } else if (param_type.charAt(0) == '[') {
        if (Array.isArray(param_value)) {
            return param_value.reduce(async(promise, value) => {
                await promise;
                await assertType(shell, schema, type.type_name, value);
            }, null);
        } else if (param_value != null) {
            assert.fail(`Expected ${param_value} to be an Array`);
        }
    } else if (type.values.length && !~type.values.indexOf(param_value)) {
        assert.fail(`Expected ${param_value} to be one of ${type.values.join(', ')}`);
    } else if (param_value != null && typeof param_value == 'object' &&
            Object.keys(type.object_properties).length) {
        const keys = Object.keys(type.object_properties);
        await Promise.all(Object.keys(param_value).map(async(key) => {
            if (!~keys.indexOf(key)) {
                const correct_entries = Object.entries(param_value).filter(entry => ~keys.indexOf(entry[0]));
                const example = correct_entries.reduce((example, entry) => {
                    example[entry[0]] = entry[1];
                    return example;
                }, {...type.object_values});
                assert.deepEqual(param_value, example);
            } else {
                await assertType(shell, schema, type.object_properties[key], param_value[key]);
            }
        }));
    } else if (param_value != null && Object.keys(type.object_properties).length) {
        assert.fail(`Expected ${param_value} to be an object`);
    } else if (param_value != null && isIncorrectPrimitive(type, param_value)) {
        assert.fail(`Expected ${param_value} to be a(n) ${param_type}`);
    }
}

/**
 * Checks that integers are integers, doubles are floats, booleans are booleans, and strings are strings
 */
function isIncorrectPrimitive(type, value) {
    switch(type.type_name) {
        case 'int':
        case 'Integer':
        case 'long':
        case 'Long':
            return Number.isNaN(Number.parseFloat(value)) || Number.isNaN(+value) || !Number.isInteger(+value);
        case 'double':
        case 'Double':
            return Number.isNaN(Number.parseFloat(value)) || Number.isNaN(+value);
        case 'boolean':
        case 'Boolean':
            return value && typeof value != 'boolean';
        case 'String':
            return value != null && typeof value == 'object';
        default:
            return false;
    }
}
