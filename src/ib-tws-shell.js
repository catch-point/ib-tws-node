#!/usr/bin/env node
// vim: set filetype=javascript:
// ib-tws-shell.js
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
const {Command} = require('commander');
const pkg = require('../package.json');
const HOME = require('os').homedir();
const realpath = util.promisify(fs.realpath);
const readFile = util.promisify(fs.readFile);
const access = util.promisify(fs.access);
const readdir = util.promisify(fs.readdir);

/**
 * If launched directly, open a shell to the underlying ib-tws-shell java process.
 * Otherwise, export a factory function to create a new process
 */
if (require.main === module) {
    const program = new Command();
    program.name('ib-tws-shell').usage('[options] [script files...]')
        .storeOptionsAsProperties(false)
        .version(pkg.version, '-v, --version', 'output the current version')
        .option("--launcher <exe>", "Launch script used to setup shell environment")
        .option("--tws-version <version>", "The major version number of the installed TWS software")
        .option("--tws-path <path>", "Location of Jts/ibgateway/Trader Workstation/IB Gateway folder to use")
        .option("--tws-settings-path <path>", "Where TWS will read/store settings")
        .option("--tws-api-path <path>", "The TwsApi directory to be searched for TwsApi.jar")
        .option("--tws-api-jar <path>", "The TwsApi.jar filename")
        .option("--java-home <path>", "The location of the jre to launch")
        .option("--no-prompt", "Don't prompt for input")
        .option("-s, --silence", "Don't log to stderr")
        .option("-i, --interactive", "Enter interactive mode after executing a script file")
        .option("-h, --help", "This message");
    program.parse(process.argv);
    const settings = program.opts();
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
    const shell = await spawn_shell({...settings, "no-prompt": true}, [], 'pipe');
    shell.stderr.pipe(process.stderr);
    return shell;
}

/**
 * Spawns a ib-tws-shell process with the given settings
 */
async function spawn_shell(settings, scripts, stdio) {
    const java_exe = await getJavaExe(settings);
    const launcher = [].concat(settings['launcher'])[0] || java_exe;
    const vm_args = await getVMOptions(settings);
    const jar = path.resolve(module.filename, '../..', 'lib/ib-tws-shell.jar');
    const cp = await getClassPath(jar, settings);
    const args = [];
    if (settings['launcher']) {
        args.push(...[].concat(settings['launcher']).slice(1));
        args.push(java_exe);
    }
    args.push('-cp');
    args.push(cp);
    args.push('com.meerkattrading.tws.Shell');
    if (settings['tws-settings-path']) {
        args.push('--tws-settings-path');
        args.push(settings['tws-settings-path']);
    }
    if (settings['no-prompt']) {
        args.push('--no-prompt');
    }
    if (settings['silence']) {
        args.push('--silence');
    }
    if (settings['interactive']) {
        args.push('--interactive');
    }
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
    return search.reduce(async(p, jre) => await p || await access(jre).then(() => jre, err => {}), null);
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
        return search.reduce(async(p, i4j) => await p || await access(i4j).then(() => i4j, err => {}), null);
    }, null);
}

/**
 * Reads the JVM arguments in the TWS install directory
 */
async function getVMOptions(settings) {
    const vmoptions = await getVMOptionsFile(settings);
    if (!vmoptions) return [];
    const contents = await readFile(vmoptions, 'utf8');
    return contents.split(/\n|\r/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

/**
 * Finds the vmoptions file in the TWS install directory
 */
async function getVMOptionsFile(settings) {
    const vmoptions = await getJtsPathSearch(settings).reduce(async(found, jts_path) => {
        if (await found) return found;
        const version = await getJtsVersion(jts_path, settings);
        const isGateway = jts_path.match(/gateway/i);
        const search = version ? [
            path.resolve(jts_path, version, isGateway ? "ibgateway.vmoptions" : "tws.vmoptions"),
            path.resolve(jts_path, isGateway ? "ibgateway.vmoptions" : "tws.vmoptions"),
            path.resolve(jts_path, "ibgateway", version, "ibgateway.vmoptions"),
            path.resolve(jts_path, "IB Gateway " + version, "ibgateway.vmoptions"),
            path.resolve(jts_path, "Trader Workstation " + version, "tws.vmoptions"),
            path.resolve(HOME, "Jts",(isGateway ? "ibgateway-" : "tws-") + version + ".vmoptions"),
            path.resolve(jts_path, "ibgateway", "ibgateway.vmoptions"),
            path.resolve(jts_path, "IB Gateway", "ibgateway.vmoptions"),
            path.resolve(jts_path, "Trader Workstation", "tws.vmoptions"),
            path.resolve(HOME, "Jts", isGateway ? "ibgateway.vmoptions" : "tws.vmoptions")
        ] : [
            path.resolve(jts_path, isGateway ? "ibgateway.vmoptions" : "tws.vmoptions"),
            path.resolve(HOME, "Jts", (isGateway ? "ibgateway-" : "tws-") + version + ".vmoptions"),
            path.resolve(jts_path, "ibgateway", "ibgateway.vmoptions"),
            path.resolve(jts_path, "IB Gateway", "ibgateway.vmoptions"),
            path.resolve(jts_path, "Trader Workstation", "tws.vmoptions"),
            path.resolve(HOME, "Jts", isGateway ? "ibgateway.vmoptions" : "tws.vmoptions")
        ];
        return search.reduce(async(found, vmoptions) => {
            if (await found) return found;
            return access(vmoptions).then(() => vmoptions, () => null);
        }, null);
    }, null);
    if (vmoptions) {
        return vmoptions;
    } else if (!settings["tws-path"]) {
        console.error("Could not find vmoptions try --tws-path=...");
    } else if (!settings["tws-version"]) {
        console.error("Could not find vmoptions try --tws-version=...");
    } else {
        console.error("Could not find vmoptions");
    }
    return null;
}

/**
 * Creates the Java Class Path
 */
async function getClassPath(jar, settings) {
    const jars = [jar];
    const jts_jars = await getJtsJars(settings);
    if (jts_jars.length) {
        jars.push(...jts_jars);
    }
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
 * Identify all the jars needed to launch TWS
 */
async function getJtsJars(settings) {
    const jars_dir = await getJtsJarsDir(settings);
    if (jars_dir == null) return [];
    const jars = await listNumerically(jars_dir);
    return Object.values(jars.reduce((jars, jar) => {
        const key = jar.replace(/[^a-zA-Z0-9][0-9].*$/,'');
        if (!jars[key]) jars[key] = path.resolve(jars_dir, jar);
        return jars;
    }, {}));
}

/**
 * Finds the jars directory in the TWS install
 */
async function getJtsJarsDir(settings) {
    const jars_dir = await getJtsPathSearch(settings).reduce(async(found, jts_path) => {
        if (await found) return found;
        const version = await getJtsVersion(jts_path, settings);
        const search = version ? [
            path.resolve(jts_path, version, "jars"),
            path.resolve(jts_path, "ibgateway", version, "jars"),
            path.resolve(jts_path, "IB Gateway " + version, "jars"),
            path.resolve(jts_path, "Trader Workstation " + version, "jars"),
            path.resolve(jts_path, "jars"),
            path.resolve(jts_path, "ibgateway", "jars"),
            path.resolve(jts_path, "IB Gateway", "jars"),
            path.resolve(jts_path, "Trader Workstation", "jars")
        ] : [
            path.resolve(jts_path, "jars"),
            path.resolve(jts_path, "ibgateway", "jars"),
            path.resolve(jts_path, "IB Gateway", "jars"),
            path.resolve(jts_path, "Trader Workstation", "jars")
        ];
        return search.reduce(async(found, jars) => {
            if (await found) return found;
            return access(jars).then(() => jars, () => null);
        }, null);
    }, null);
    if (jars_dir) {
        return jars_dir;
    } else if (!settings["tws-path"]) {
        throw Error("Could not find jars try --tws-path=...");
    } else if (!settings["tws-version"]) {
        throw Error("Could not find jars try --tws-version=...");
    } else {
        throw Error("Could not find jars");
    }
    return null;
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
    if (settings["tws-api-path"])
        return searchFor(settings["tws-api-path"], "TwsApi.jar");
    const tws_api_path_search = [
        "C:\\TWS API",
        path.resolve(HOME, "IBJts"),
        path.resolve(HOME, "Jts"),
        path.resolve(HOME, "Downloads"),
        path.resolve(HOME, "Download"),
        path.resolve(HOME, "lib"),
        path.resolve(HOME, "libs")
    ];
    return tws_api_path_search.reduce(async(found, dir) => {
        if (await found) return found;
        else return searchFor(dir, "TwsApi.jar");
    }, null);
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
