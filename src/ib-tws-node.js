// vim: set filetype=javascript:
// ib-tws-node.js
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
const { spawn } = require('child_process');
const EventEmitter = require('events');
const assert = require('assert').strict;
const ib_tws_shell = require('./ib-tws-shell.js');
const HOME = require('os').homedir();
const realpath = util.promisify(fs.realpath);
const readFile = util.promisify(fs.readFile);
const access = util.promisify(fs.access);
const readdir = util.promisify(fs.readdir);

module.exports = createInstanceAsync;

/**
 * Async factory function to create a new client object
 */
async function createInstanceAsync(settings) {
    const self = new EventEmitter();
    const shell = await ib_tws_shell(settings);
    const onerror = err => self.emit('error', err);
    shell.on('exit', (code, signal) => {
        self.emit('exit', code, signal);
    }).on('error', onerror);
    shell.stdin.on('error', onerror);
    shell.stdout.on('error', onerror);
    shell.stderr.on('error', onerror);
    self.kill = signal => shell.kill(signal);
    self.pid = shell.pid;
    self.ref = () => shell.ref();
    self.unref = () => shell.unref();
    let buffer = '';
    shell.stdout.setEncoding('utf8');
    shell.stdout.on('data', chunk => {
        try {
            const lines = (buffer ? `buffer${chunk}` : chunk).split('\n');
            lines.forEach((line, i) => {
                if (i == lines.length -1) buffer = line;
                else emit_line(self, line);
            });
        } catch(err) {
            console.error(chunk);
            self.emit('error', err);
        }
    });
    const schema = {};
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
                    await completeItem(shell, schema, item.action_name);
                    const param_values = Array.prototype.slice.call(arguments);
                    if (param_values.length != item.param_types.length) {
                        assert.fail(`Incorrect parameters for ${item.action_name}(${item.param_types.join(',')})`)
                    }
                    await Promise.all(item.param_types.map(async(param_type, i) => {
                        await assertType(shell, schema, param_type, param_values[i]);
                    }));
                    await send(shell, item.action_name, param_values);
                    return self;
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
    }).on('disconnect', () => {
        self.isConnected = async function() {
            self.emit('isConnected', false);
        };
    });
    return new Promise((ready, fail) => {
        self.once('helpEnd', ready);
        send(shell, 'help', []).catch(fail);
    }).then(() => self);
}

/**
 * Parses the line from the shell and emits the event
 */
function emit_line(emitter, line) {
    const record = line.split('\t');
    const name = record[0];
    const args = record.slice(1).map(json => JSON.parse(json));
    return emitter.emit(name, ...args);
}

/**
 * Checks and waits for the remote help info to be available for the given item in the schema
 */
async function completeItem(shell, schema, name) {
    const item_name = name.charAt(0) == '[' ? name.substring(1, name.length-1) : name;
    const item = schema[item_name];
    if (!item.complete) {
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
    const room = shell.stdin.write(call.join('\t'));
    if (call_name == 'exit') return new Promise(cb => shell.once('exit', cb));
    if (!room) return new Promise(cb => shell.stdin.once('drain', cb));
}

/**
 * Checks that param_value conforms the given schema param_type
 */
async function assertType(shell, schema, param_type, param_value) {
    const type = await completeItem(shell, schema, param_type);
    if (param_type.charAt(0) == '[') {
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
