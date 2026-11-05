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

/**
 * Creates a JRE folder at jre holding an (empty) java executable.
 */
function makeJre(jre) {
    fs.mkdirSync(path.join(jre, 'bin'), {recursive: true});
    fs.writeFileSync(path.join(jre, 'bin', process.platform == 'win32' ? 'java.exe' : 'java'), '');
    return jre;
}

test('jts-install-dir is searched for the TWS bundled JRE', async() => {
    const jts = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-tws-json-test-'));
    try {
        const jre = makeJre(path.join(jts, 'jre'));
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

/**
 * Lays out dir like an unattended (-q) install4j install: the JRE is bundled in
 * dir/jre, and inst_jre.cfg names the installer's own temporary JRE, which no
 * longer exists. When pref is given, pref_jre.cfg names it; a JRE is created
 * there unless emptyPref is set, which leaves an empty folder with no java
 * executable. Returns the JRE that should be used.
 */
function installJts(dir, {pref, emptyPref} = {}) {
    const bundled = makeJre(path.join(dir, 'jre'));
    fs.mkdirSync(path.join(dir, '.install4j'), {recursive: true});
    fs.writeFileSync(path.join(dir, '.install4j', 'inst_jre.cfg'),
        path.join(os.tmpdir(), 'tws.sh.9.dir', 'jre') + '\n');
    if (!pref) return bundled;
    if (emptyPref) fs.mkdirSync(pref, {recursive: true});
    else makeJre(pref);
    fs.writeFileSync(path.join(dir, '.install4j', 'pref_jre.cfg'), pref);
    return emptyPref ? bundled : pref;
}

function classPath(argv) {
    return argv[argv.indexOf('-cp') + 1].split(path.delimiter);
}

for (const folder of ['tws', 'ibgateway']) {
    test(`JRE named in pref_jre.cfg is used in ~/${folder}`, withTempHome(async home => {
        fs.mkdirSync(path.join(home, 'Jts'));
        const dir = path.join(home, folder);
        const jre = installJts(dir, {pref: path.join(dir, 'chosen-jre')});
        const argv = await javaCommandLineWithHome(home, {'tws-api-jar': 'TwsApi.jar'});
        assert.equal(argv[0], `${jre}/bin/java`);
    }));
}

for (const folder of ['tws', 'ibgateway']) {
    test(`bundled JRE is used when inst_jre.cfg names a deleted JRE in ~/${folder}`, withTempHome(async home => {
        fs.mkdirSync(path.join(home, 'Jts'));
        const jre = installJts(path.join(home, folder));
        const argv = await javaCommandLineWithHome(home, {'tws-api-jar': 'TwsApi.jar'});
        assert.equal(argv[0], `${jre}/bin/java`);
    }));
}

test('bundled JRE is used when inst_jre.cfg names a deleted JRE in jts-install-dir', async() => {
    const jts = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-tws-json-test-'));
    const previous = process.env['JAVA_HOME'];
    try {
        const jre = installJts(jts);
        process.env['JAVA_HOME'] = path.join(jts, 'java-home');
        const argv = await javaCommandLine({'jts-install-dir': jts});
        assert.equal(argv[0], `${jre}/bin/java`);
    } finally {
        if (previous == null) delete process.env['JAVA_HOME'];
        else process.env['JAVA_HOME'] = previous;
        fs.rmSync(jts, {recursive: true, force: true});
    }
});

test('a JRE chosen in pref_jre.cfg is preferred over the bundled JRE', async() => {
    const jts = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-tws-json-test-'));
    try {
        const chosen = installJts(jts, {pref: path.join(jts, 'chosen-jre')});
        const argv = await javaCommandLine({'jts-install-dir': jts});
        assert.equal(argv[0], `${chosen}/bin/java`);
    } finally {
        fs.rmSync(jts, {recursive: true, force: true});
    }
});

test('a JRE folder without a java executable is skipped', async() => {
    const jts = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-tws-json-test-'));
    try {
        const jre = installJts(jts, {pref: path.join(jts, 'chosen-jre'), emptyPref: true});
        const argv = await javaCommandLine({'jts-install-dir': jts});
        assert.equal(argv[0], `${jre}/bin/java`);
    } finally {
        fs.rmSync(jts, {recursive: true, force: true});
    }
});

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
