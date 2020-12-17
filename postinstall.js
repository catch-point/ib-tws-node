#!/usr/bin/env node
// vim: set filetype=javascript:
// ib-tws-node/postinstall.js
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

const https = require('https');
const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');

const downloads = pkg['binary-dependencies'];
for (var filename in downloads) {
    fs.mkdir(path.resolve(path.dirname(filename)), {recursive: true}, () => {
        download(downloads[filename], filename);
    });
}

function download(url, file) {
    console.log(url,'->', path.resolve(filename));
    return https.get(url, response => {
        if (300 < response.statusCode && response.statusCode < 400 && response.headers.location) {
            download(response.headers.location, file);
        } else {
            response.pipe(fs.createWriteStream(file));
        }
    });
}
