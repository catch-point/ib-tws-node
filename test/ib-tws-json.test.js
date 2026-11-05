// vim: set filetype=javascript:
// ib-tws-json.test.js
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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ib_tws_json from '../src/ib-tws-json.js';

/**
 * Spawns ib-tws-json with Node as the launcher, which prints the java
 * command line it was given instead of running java.
 */
async function javaCommandLine(settings) {
    const shell = await ib_tws_json({
        'launcher': [process.execPath, '-e', 'console.log(JSON.stringify(process.argv.slice(1)))'],
        'tws-api-jar': 'TwsApi.jar',
        ...settings
    });
    let stdout = '';
    shell.stdout.setEncoding('utf8');
    shell.stdout.on('data', chunk => stdout += chunk);
    await new Promise((resolve, reject) => shell.on('error', reject).on('close', resolve));
    return JSON.parse(stdout);
}

test('jts-install-dir is searched for the TWS bundled JRE', async() => {
    const jts = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-tws-json-test-'));
    try {
        const jre = path.join(jts, 'jre');
        fs.mkdirSync(path.join(jre, 'bin'), {recursive: true});
        fs.mkdirSync(path.join(jts, '.install4j'));
        fs.writeFileSync(path.join(jts, '.install4j', 'pref_jre.cfg'), jre);
        const argv = await javaCommandLine({'jts-install-dir': jts});
        assert.equal(argv[0], `${jre}/bin/java`);
    } finally {
        fs.rmSync(jts, {recursive: true, force: true});
    }
});

test('JAVA_HOME is used when an install4j directory has no JRE', async() => {
    const jts = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-tws-json-test-'));
    const previous = process.env['JAVA_HOME'];
    try {
        const javaHome = path.join(jts, 'java-home');
        fs.mkdirSync(javaHome, {recursive: true});
        fs.mkdirSync(path.join(jts, '.install4j'));
        process.env['JAVA_HOME'] = javaHome;
        const argv = await javaCommandLine({'jts-install-dir': jts});
        assert.equal(argv[0], `${javaHome}/bin/java`);
    } finally {
        if (previous == null) delete process.env['JAVA_HOME'];
        else process.env['JAVA_HOME'] = previous;
        fs.rmSync(jts, {recursive: true, force: true});
    }
});

/**
 * Runs ib-tws-json in a child Node process whose home folder is home, and
 * returns the java command line it builds.
 */
async function javaCommandLineWithHome(home, settings) {
    const module = new URL('../src/ib-tws-json.js', import.meta.url).href;
    const script = `
        const {default: ib_tws_json} = await import(${JSON.stringify(module)});
        const shell = await ib_tws_json(${JSON.stringify({
            'launcher': [process.execPath, '-e', 'console.log(JSON.stringify(process.argv.slice(1)))'],
            ...settings
        })});
        shell.stdout.pipe(process.stdout);
    `;
    const {execFile} = await import('node:child_process');
    const env = {...process.env, HOME: home, USERPROFILE: home};
    delete env['JAVA_HOME'];
    const stdout = await new Promise((resolve, reject) => {
        execFile(process.execPath, ['--input-type=module', '-e', script], {env}, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
        });
    });
    return JSON.parse(stdout);
}

function withTempHome(fn) {
    return async() => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-tws-json-home-'));
        try {
            await fn(home);
        } finally {
            fs.rmSync(home, {recursive: true, force: true});
        }
    };
}

function installJre(dir) {
    const jre = path.join(dir, 'jre');
    fs.mkdirSync(path.join(jre, 'bin'), {recursive: true});
    fs.mkdirSync(path.join(dir, '.install4j'), {recursive: true});
    fs.writeFileSync(path.join(dir, '.install4j', 'pref_jre.cfg'), jre);
    return jre;
}

function classPath(argv) {
    return argv[argv.indexOf('-cp') + 1].split(path.delimiter);
}

for (const folder of ['tws', 'ibgateway']) {
    test(`JRE is found in an unattended install in ~/${folder}`, withTempHome(async home => {
        fs.mkdirSync(path.join(home, 'Jts'));
        const jre = installJre(path.join(home, folder));
        const argv = await javaCommandLineWithHome(home, {'tws-api-jar': 'TwsApi.jar'});
        assert.equal(argv[0], `${jre}/bin/java`);
    }));
}

test('TwsApi.jar is found in an unattended install in ~/tws-api', withTempHome(async home => {
    const jar = path.join(home, 'tws-api', 'source', 'JavaClient', 'TwsApi.jar');
    fs.mkdirSync(path.dirname(jar), {recursive: true});
    fs.writeFileSync(jar, '');
    const argv = await javaCommandLineWithHome(home, {});
    assert.equal(classPath(argv)[1], jar);
}));

test('TwsApi.jar is found in the newest ~/TWS API <version> folder', withTempHome(async home => {
    for (const version of ['10.37.02', '10.50.02', '10.9']) {
        const jar = path.join(home, `TWS API ${version}`, 'source', 'JavaClient', 'TwsApi.jar');
        fs.mkdirSync(path.dirname(jar), {recursive: true});
        fs.writeFileSync(jar, '');
    }
    const argv = await javaCommandLineWithHome(home, {});
    assert.equal(classPath(argv)[1], path.join(home, 'TWS API 10.50.02', 'source', 'JavaClient', 'TwsApi.jar'));
}));

test('TwsApi.jar is found in ~/Applications/TWS API <version>', withTempHome(async home => {
    const jar = path.join(home, 'Applications', 'TWS API 10.50.02', 'source', 'JavaClient', 'TwsApi.jar');
    fs.mkdirSync(path.dirname(jar), {recursive: true});
    fs.writeFileSync(jar, '');
    const argv = await javaCommandLineWithHome(home, {});
    assert.equal(classPath(argv)[1], jar);
}));
