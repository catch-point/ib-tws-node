#!/usr/bin/env node
// vim: set filetype=javascript:
// ib-tws-json.js
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
const { spawn } = require('child_process');
const EventEmitter = require('events');
const assert = require('assert').strict;
const {Command} = require('commander');
const pkg = require('../package.json');
const HOME = require('os').homedir();
const realpath = util.promisify(fs.realpath);
const readFile = util.promisify(fs.readFile);
const access = util.promisify(fs.access);
const readdir = util.promisify(fs.readdir);

/**
 * If launched directly, open a shell to the underlying ib-tws-json java process.
 * Otherwise, export a factory function to create a new process
 */
if (require.main === module) {
    const program = new Command();
    program.name('ib-tws-json').usage('[options] [script files...]')
        .storeOptionsAsProperties(false)
        .version(pkg.version, '-v, --version', 'output the current version')
        .option("--launcher <exe>", "Launch script used to setup shell environment")
		.option("--install", "Installs the TWS JSON extension from TWS")
		.option("--uninstall", "Uninstalls the TWS JSON extension from TWS")
		.option("--launch", "Installs the TWS JSON extension and starts TWS before exiting")
		.option("-i, --interactive", "Enter interactive client mode")
		.option("--no-prompt", "Don't prompt for input when in interactive mode")
		.option("--tws-api-path <path>", "The TwsApi directory to be searched for TwsApi.jar")
		.option("-j, --tws-api-jar <file>", "The TwsApi.jar filename")
		.option("--tws-api-host <inet>", "Hostname or IP running TWS")
		.option("-p, --tws-api-port <integer>", "Port TWS API is running on")
		.option("--json-api-port <integer>", "Server port for TWS JSON API to listen on")
		.option("--json-api-port-offset <integer>", "Server JSON port offset from tws-api-port")
		.option("--json-api-inet <inet>", "Server local network interface to listen on for TWS JSON API")
		.option("--jts-exe-name <filename>", "The primary launch filename installed by TWS software")
		.option("--jts-install-dir <path>",
				"Location of Jts/ibgateway/Trader Workstation/IB Gateway folder to use")
		.option("--jts-config-dir <path>", "Where TWS will read/store settings")
        .option("--java-home <path>", "The location of the jre to launch")
        .option("-h, --help", "This message");
    program.parse(process.argv);
    const settings = program.options.reduce((settings, option) => {
        const value = program.opts()[option.attributeName()];
        if (value != null) {
            if (option.long.startsWith('--no-')) {
                settings[option.long.substring(2)] = !value;
            } else if (option.long.startsWith('--')) {
                settings[option.long.substring(2)] = value;
            }
        }
        return settings;
    }, {});
    if (settings['help']) {
        program.outputHelp();
    } else {
        spawn_shell(settings, program.args, 'inherit').then(java => {
            java.on('error', err => {
                console.error(err);
            }).on('exit', code => {
                process.exitCode = code;
                process.stdin.destroy();
            });
        });
    }
} else {
    module.exports = create_shell;
}

/**
 * Factory function to create a new child process
 */
async function create_shell(settings) {
    const shell = await spawn_shell(settings, [], 'pipe');
    shell.stderr.pipe(process.stderr);
    return shell;
}

/**
 * Spawns a ib-tws-json process with the given settings
 */
async function spawn_shell(settings, scripts, stdio) {
    const java_exe = await getJavaExe(settings);
    const launcher = [].concat(settings['launcher'])[0] || java_exe;
    const jar = path.resolve(module.filename, '../..', 'lib/ib-tws-json.jar');
    const cp = await getClassPath(jar, settings);
    const args = [];
    if (settings['launcher']) {
        args.push(...[].concat(settings['launcher']).slice(1));
        args.push(java_exe);
    }
    args.push('-cp');
    args.push(cp);
    args.push('com.meerkattrading.tws.Shell');
    [ "install", "uninstall", "launch", "interactive", "no-prompt" ].forEach(opt => {
        if (settings[opt]) {
            args.push(`--${opt}`);
        }
    });
    [
        "tws-api-path", "tws-api-jar", "tws-api-host", "tws-api-port", "json-api-port",
        "json-api-port-offset", "json-api-inet", "jts-exe-name", "jts-install-dir",
        "jts-config-dir"
    ].forEach(opt => {
        if (settings[opt]) {
            args.push(`--${opt}`);
            args.push(settings[opt]);
        }
    });
    if (scripts && scripts.length) {
        args.push(...scripts);
    }
    return spawn(launcher, args, {stdio, env: {...process.env, ...settings.env}});
}

/**
 * Locates the java executable
 */
async function getJavaExe(settings) {
    const jre = await findJavaRuntimeEnvironment(settings);
    if (await access(jre).then(() => jre, err => {})) return `${jre}/bin/java`;
    else return 'java';
}

/**
 * Locals the JRE on the system by looking in the usual TWS locations.
 */
async function findJavaRuntimeEnvironment(settings) {
    const arg_value = settings['java-home'];
    if (arg_value) return arg_value;
    const install4j = await getInstall4j(settings);
    if (!install4j) return process.env['JAVA_HOME'];
    const search = [
        path.resolve(install4j, 'jre.bundle', 'Contents', 'Home', 'jre'),
        await readFile(path.resolve(install4j, 'pref_jre.cfg'), 'utf8').catch(err => {}),
        await readFile(path.resolve(install4j, 'inst_jre.cfg'), 'utf8').catch(err => {})
    ].map(jre => jre && jre.trim()).filter(jre => jre);
    const jre = await search.reduce(async(p, jre) => {
        return await p || await access(jre).then(() => jre, err => {});
    }, null);
    return jre;
}

/**
 * Locates the .install4j folders of a TWS install
 */
async function getInstall4j(settings) {
    return getJtsPathSearch(settings).reduce(async(found, jts_path) => {
        if (await found) return found;
        const version = await getJtsVersion(jts_path, settings);
        const search = version != null ? [
            path.resolve(jts_path, version, '.install4j'),
            path.resolve(jts_path, 'ibgateway', version, '.install4j'),
            path.resolve(jts_path, `IB Gateway ${version}`, '.install4j'),
            path.resolve(jts_path, `Trader Workstation ${version}`, '.install4j')
        ] : [
            path.resolve(jts_path, '.install4j'),
            path.resolve(jts_path, 'ibgateway', '.install4j'),
            path.resolve(jts_path, 'IB Gateway', '.install4j'),
            path.resolve(jts_path, 'Trader Workstation', '.install4j')
        ];
        const i4j = await search.reduce(async(p, i4j) => {
            return await p || await access(i4j).then(() => i4j, err => {});
        }, null);
        return i4j;
    }, null);
}

/**
 * Creates the Java Class Path
 */
async function getClassPath(jar, settings) {
    const jars = [jar];
    const tws_api_jar = await getTwsApiJar(settings);
    if (tws_api_jar) {
        jars.push(tws_api_jar);
    } else {
        throw Error("Could not find TwsApi.jar try --tws-api-jar=...");
    }
    const path_separator = process.platform.toLowerCase() == 'win32' ? ';' : ':';
    return jars.join(path_separator);
}

/**
 * List of common TWS install locations
 */
function getJtsPathSearch(settings) {
    const arg_value = settings['tws-path'];
    if (arg_value) return [arg_value];
    else return [
        "C:\\Jts\\ibgateway",
        "C:\\Jts",
        HOME + "/Jts/ibgateway",
        HOME + "/Jts",
        HOME + "/Applications"
    ];
}

/**
 * Looks for installed TWS versions on the system
 */
async function getJtsVersion(jts_path, settings) {
    if (settings['tws-version']) return settings['tws-version'];
    const list = await listNumerically(jts_path);
    return list.reduce(async(found, name) => {
        if (await found) return found;
        const m = name.match(/^(IB Gateway |Trader Workstation |ibgateway-|tws-)?([0-9]+)(\.vmoptions)?$/);
        const dir = path.resolve(jts_path, name);
        if (m) return access(dir).then(() => m[2], () => null);
        else return null;
    }, null);
}

/**
 * Finds the TwsApi.jar file
 */
async function getTwsApiJar(settings) {
    if (settings["tws-api-jar"])
        return settings["tws-api-jar"];
    if (settings["tws-api-path"]) {
        const jar = await searchFor(settings["tws-api-path"], "TwsApi.jar");
        return jar;
    }
    const tws_api_path_search = [
        "C:\\TWS API",
        path.resolve(HOME, "IBJts"),
        path.resolve(HOME, "Jts"),
        path.resolve(HOME, "Downloads"),
        path.resolve(HOME, "Download"),
        path.resolve(HOME, "lib"),
        path.resolve(HOME, "libs")
    ];
    const jar = await tws_api_path_search.reduce(async(found, dir) => {
        if (await found) return found;
        else return searchFor(dir, "TwsApi.jar");
    }, null);
    return jar;
}

/**
 * Searches the folder for filename
 */
async function searchFor(folder, filename) {
    const list = await listNumerically(folder);
    return list.reduce(async(found, ls) => {
        if (await found) return found;
        else if (ls.toLowerCase() == filename.toLowerCase()) return path.resolve(folder, ls);
        else return searchFor(path.resolve(folder, ls), filename);
    }, null);
}

/**
 * Lists the contents of the directory with the highest version numbers first
 */
async function listNumerically(dir) {
    const list = await readdir(dir).catch(err => []);
    if (!list || !list.length) return [];
    return list.sort((arg0, arg1) => {
        const split0 = arg0.split(/[^a-zA-Z0-9]+/);
        const split1 = arg1.split(/[^a-zA-Z0-9]+/);
        return split0.reduce((cmp, t0, t) => {
            if (cmp) return cmp;
            const t1 = split1[t];
            if (t0 && t1 && t0.match(/^[0-9]+$/) && t1.match(/^[0-9]+$/)) {
                return +t0 < +t1 ? -1 : +t0 > +t1 ? 1 : 0;
            } else {
                return t0 < t1 ? -1 : t0 > t1 ? 1 : 0;
            }
        }, 0);
    }).reverse();
}
