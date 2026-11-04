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
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert').strict;
const { test } = require('node:test');
const ib_tws_json = require('../src/ib-tws-json.js');

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
