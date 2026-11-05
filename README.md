# ib-tws-node

Node client library for Interactive Brokers' Trader Workstation (TWS) and IB Gateway.

Introduction
------------

The TWS API is a simple yet powerful interface through which Interactive Brokers clients can automate their trading strategies, request market data and monitor their account balance and portfolio in real time.

This project uses the official Interactive Brokers Java Client and provides a Node interface bridge to it. Rather than re-implementing the binary TWS API protocol in JavaScript, it relies on [ib-tws-json](https://github.com/catch-point/ib-tws-json), which extends TWS or IB Gateway (in the same JVM) with a line-based JSON API. When the extension is not installed, ib-tws-json runs the Java Client in a separate JVM instead.

Because the method and type definitions are read from the Java Client at runtime, the methods available on the client always match the version of the TWS API you have installed, and every call is validated against it before it is sent.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together and [CHANGELOG.md](CHANGELOG.md) for the release history.

Requirements
------------

Users must agree to the terms of the Interactive Brokers license and download their software and Java Client API.

* **Node.js 20.19+ or 22.12+.**
* **TWS or IB Gateway.** The TWS API is an interface to TWS or IB Gateway, and as such requires network connectivity to a running instance of one of these programs. They can be downloaded here: https://www.interactivebrokers.com/en/index.php?f=14099#tws-software
* **The TWS API (Java).** Download the API Components from http://interactivebrokers.github.io and save them to the installer's default folder (`C:\TWS API <version>`, `~/Applications/TWS API <version>`, `~/TWS API <version>`, or `~/tws-api` for an unattended install) or `~/IBJts`, or point `twsApiJar` / `twsApiPath` at the `TwsApi.jar` file.
* **Java.** By default the JRE bundled with the local TWS installation is used. Otherwise `JAVA_HOME` or `java` on the `PATH` is used.
* A working knowledge of the TWS API.

Note that you do not need an IBKR account to try this out, as you can use IBKR's Free Trial offer, for which there is a link at the top of the homepage on their website.

Installation
------------

This package is not published to the npm registry. Install it from GitHub, optionally pinning a release tag:

```
npm install github:catch-point/ib-tws-node
npm install github:catch-point/ib-tws-node#v2.1.3
```

During installation, `postinstall.js` downloads `lib/ib-tws-json.jar` from the [ib-tws-json releases](https://github.com/catch-point/ib-tws-json/releases) and verifies its SHA-256 checksum. The installation fails if the download fails or the checksum does not match.

If you install with `--ignore-scripts`, run the download yourself afterwards:

```
node node_modules/ib-tws-node/postinstall.js
```

Quick Start
-----------

Below is an example of using TWS with ib-tws-node, where TWS is installed in the default location and the TWS API is installed in `~/IBJts`. ib-tws-node is an ES module; the example uses top-level `await`, so save it as an `.mjs` file (or in a package with `"type": "module"`).

```js
import Client from 'ib-tws-node';

const client = await Client({twsApiPort: 7496});

// Always listen for 'error': Node throws if an EventEmitter emits 'error' without a listener
client.on('error', console.log);

// Farm connection messages, such as 2104 and 2106, are informational
const informational = new Set([2104, 2106, 2158]);
const onError = abort => (reqId, time, code, msg) => {
    if (!informational.has(code)) abort(msg);
};

let nextValidId = await new Promise((ready, abort) => {
    client.once('nextValidId', ready);
    client.on('error', onError(abort));
    client.eConnect(0, false).catch(abort);
});

const id = nextValidId++;

// use await to throw parameter validation errors
await client.placeOrder(id, {
    symbol: 'AAPL',
    exchange: 'SMART',
    currency: 'USD',
    secType: 'STK'
}, {
    action: 'BUY',
    totalQuantity: 1,
    orderType: 'MIDPRICE'
});

const order_status = await new Promise((ready, abort) => {
    let order_status;
    client.on('error', onError(abort));
    client.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld, mktCapPrice) => {
        if (id == orderId) {
            order_status = status;
            if (['ApiCancelled', 'Cancelled', 'Filled'].includes(status)) ready(orderId);
            else console.log(orderId, status, filled, lastFillPrice);
        }
    });
    setTimeout(() => ready(order_status), 10000);
    client.reqOpenOrders().catch(abort);
});

await client.exit();
```

API Client
----------

The client makes heavy use of promises *and* events. Every method returns a promise that validates the input before passing it along to TWS, even though none of the methods resolve to anything useful. All responses are delivered as events on the client.

Methods on the client vary slightly depending on the version of the TWS API available. Use the `help` and `help "EClient"` commands in the shell to list the available methods, or go straight to the documentation for the latest: https://interactivebrokers.github.io/tws-api/classIBApi_1_1EClient.html

Events from the client can be listed using the `help "EWrapper"` command and are documented here: https://interactivebrokers.github.io/tws-api/interfaceIBApi_1_1EWrapper.html

Modes
-----

There are three modes to run ib-tws-node. The client picks the first one that works when it is created:

 1. **TWS JSON extension.** Install the extension using `ib-tws-json --install` and have TWS running. The client connects directly to the JSON API port.
 2. **Stand-alone Java Client.** If the extension is not running but the TWS API port is in use (or `twsApiHost` is set), the client starts the TWS API Java Client in a separate JVM and talks to it over stdin/stdout.
 3. **Launch TWS.** If TWS is not running, the client launches it with the TWS JSON extension installed and waits (up to `timeout`, two minutes by default, to allow for two-factor login) for the JSON API to come online.

If `twsApiPort` is not given, the client scans the standard local ports: 4002 (IB Gateway paper), 7497 (TWS paper), 4001 (IB Gateway live) and 7496 (TWS live). The JSON API port is the TWS API port plus `jsonApiPortOffset` (100 by default), so TWS on 7496 is matched with a JSON API on 7596.

API Guide
---------

### Client

The ib-tws-node module's default export is an async factory function that resolves to a new client once the method schema has been loaded.

```js
import Client from 'ib-tws-node';         // ES modules
const Client = require('ib-tws-node');    // CommonJS (Node 20.19+ / 22.12+ can require ES modules)
```

It takes the following options.

| Option | Description |
|--------|-------------|
|twsApiPort|The port number that TWS is configured to run the TWS API on. If not provided, the standard local ports are scanned.|
|twsApiHost|If not localhost, use this to provide a remote hostname running TWS. This also prevents ib-tws-node from launching a local TWS.|
|jsonApiPort|The JSON API port, if different from `twsApiPort + jsonApiPortOffset`.|
|jsonApiPortOffset|Offset added to the TWS API port to find the JSON API port. Defaults to 100.|
|jsonApiHost|If different from `twsApiHost`, the remote host running the JSON API.|
|jsonApiInet|The local network interface the JSON API listens on when ib-tws-node launches TWS.|
|twsApiJar|Points to the TwsApi.jar file that should be used when connecting to TWS. If none is provided it is searched for using `twsApiPath`.|
|twsApiPath|Where to look for the TwsApi.jar file (if `twsApiJar` is not provided). If not provided, it looks in `C:\TWS API*`, `~/TWS API*`, `~/Applications/TWS API*`, `~/tws-api`, `~/IBJts`, `~/Jts`, `~/Downloads`, `~/Download`, `~/lib` and `~/libs`.|
|javaHome|The JRE that is used to launch TWS. If none is provided, an install4j JRE is searched for in the TWS or IB Gateway installation (`C:\Jts`, `~/Jts`, `~/Applications`, or `~/tws` and `~/ibgateway` for an unattended install). Note that TWS cannot be run with just any JRE and depends on features provided with the JRE that came with the install.|
|jtsInstallDir|The install location of TWS Desktop or Gateway. If using an offline version (or Gateway) this can point to the folder with the version number. When not provided, the system looks in the default location for Gateway and (if not found) TWS Desktop.|
|jtsExeName|When launching TWS, use this script name in `jtsInstallDir` to launch it.|
|jtsConfigDir|Where TWS reads and stores its settings. Every running instance must have a unique config directory, which defaults to `~/Jts`.|
|launcher|An optional executable (or Array of executable and arguments) to set up the environment and launch ib-tws-json. The java command is appended as arguments.|
|env|Environment variables (key-value pairs) for the Java process.|
|timeout|How long, in milliseconds, to wait for a launched TWS to open its JSON API port. Defaults to 120000 (two minutes).|
|noLaunch|Set to `true` to never launch TWS; fail instead if it is not running.|

Besides the TWS API methods, the client has the following members.

| Member | Description |
|--------|-------------|
|`exit()`|Closes the connection or Java process. Resolves once it has closed.|
|`kill()`|Destroys the connection or Java process immediately.|
|`ref()` / `unref()`|Controls whether the underlying socket or process keeps the Node event loop alive.|
|`'exit'` event|Emitted when the connection or Java process has closed. After this, methods reject (except `exit`, and `isConnected`, which emits `isConnected` with `false`).|

The factory function also has a `logger` property (defaults to `console`). Set `Client.logger` to any object that has an `error` method to redirect output from the Java process.

### help

The command `help` lists the available action types, event types and actions in `help` events. `help "<name>"` describes the parameters of a method, the properties of a type or the values of an enum. `helpEnd` is sent to indicate the response is complete.

`help "EWrapper"` lists the events sent from the shell based on activity in TWS.

### TWS Commands

Additional commands are documented in [ib-tws-json](https://github.com/catch-point/ib-tws-json/).

Shell
-----

This library includes the `ib-tws-json` command, which can be used to learn more about the API. A particularly useful command is `help`, which can be combined with a method name or type to print out the parameters or properties available. For example, if you cannot remember if it's `conid` or `conId`, use the shell to quickly find out. The client would reject a promise if you got the properties wrong anyway.

```
$ ib-tws-json --tws-api-port 7496
> help "Contract"
help	"Contract"	"comboLegs"	"[ComboLeg]"	[]
help	"Contract"	"comboLegsDescrip"	"String"	null
help	"Contract"	"conid"	"int"	0
help	"Contract"	"currency"	"String"	null
help	"Contract"	"deltaNeutralContract"	"DeltaNeutralContract"	null
help	"Contract"	"exchange"	"String"	null
help	"Contract"	"includeExpired"	"boolean"	false
help	"Contract"	"lastTradeDateOrContractMonth"	"String"	null
help	"Contract"	"localSymbol"	"String"	null
help	"Contract"	"multiplier"	"String"	null
help	"Contract"	"primaryExch"	"String"	null
help	"Contract"	"right"	"Right"	"None"
help	"Contract"	"secId"	"String"	null
help	"Contract"	"secIdType"	"SecIdType"	"None"
help	"Contract"	"secType"	"SecType"	"None"
help	"Contract"	"strike"	"double"	"0.0"
help	"Contract"	"symbol"	"String"	null
help	"Contract"	"tradingClass"	"String"	null
helpEnd	"Contract"
> help "OrderCondition"
help	"OrderCondition"	"changePercent"	"double"	null
help	"OrderCondition"	"conId"	"int"	null
help	"OrderCondition"	"conjunctionConnection"	"boolean"	null
help	"OrderCondition"	"exchange"	"String"	null
help	"OrderCondition"	"isMore"	"boolean"	null
help	"OrderCondition"	"percent"	"int"	null
help	"OrderCondition"	"price"	"double"	null
help	"OrderCondition"	"secType"	"String"	null
help	"OrderCondition"	"symbol"	"String"	null
help	"OrderCondition"	"time"	"String"	null
help	"OrderCondition"	"triggerMethod"	"int"	null
help	"OrderCondition"	"type"	"OrderConditionType"	null
help	"OrderCondition"	"volume"	"int"	null
helpEnd	"OrderCondition"
> exit
```

All the methods available on the ib-tws-node client are also available from `ib-tws-json`, making it a useful tool to try things out in TWS before committing them to code.

Below we quickly confirm that `REL` orders are not supported on the TSE exchange.

```
$ ib-tws-json --tws-api-port 7496
> eConnect 0 false
connectAck
managedAccounts	"U112233"
nextValidId	1
error	-1	"1768779264095" 2104	"Market data farm connection is OK:usfarm.nj"   ""
error	-1	"1768779264095" 2104	"Market data farm connection is OK:cashfarm"    ""
error	-1	"1768779264095" 2104	"Market data farm connection is OK:cafarm"  ""
error	-1	"1768779264095" 2104	"Market data farm connection is OK:usfarm"  ""
error	-1	"1768779264095" 2106	"HMDS data farm connection is OK:ushmds"    ""
error	-1	"1768779264095" 2158	"Sec-def data farm connection is OK:secdefnj"   ""
> placeOrder 1 {
...   "symbol":"SHOP","exchange": "TSE","currency":"CAD","secType":"STK"
... } {
...   "action":"BUY","totalQuantity":1,"orderType":"REL"
... }
error	1	"1768779264095" 387	"Unsupported order type for this exchange and security type."   ""
> exit
```

### Command-line options

```
Usage: ib-tws-json [options] [script files...]
```

| Option | Description |
|--------|-------------|
|`-v, --version`|Output the current version.|
|`-h, --help`|Show the list of options.|
|`--install`|Install the TWS JSON extension into TWS.|
|`--uninstall`|Uninstall the TWS JSON extension from TWS.|
|`--launch`|Install the TWS JSON extension and start TWS before exiting.|
|`-i, --interactive`|Enter interactive client mode.|
|`--no-prompt`|Don't prompt for input in interactive mode (useful when piping commands).|
|`-p, --tws-api-port <integer>`|Port the TWS API is running on.|
|`--tws-api-host <inet>`|Hostname or IP running TWS.|
|`--json-api-port <integer>`|Server port for the TWS JSON API to listen on.|
|`--json-api-port-offset <integer>`|Server JSON port offset from `--tws-api-port`.|
|`--json-api-inet <inet>`|Local network interface for the TWS JSON API to listen on.|
|`-j, --tws-api-jar <file>`|The TwsApi.jar file.|
|`--tws-api-path <path>`|Directory to search for TwsApi.jar.|
|`--jts-install-dir <path>`|Location of the Jts / ibgateway / Trader Workstation / IB Gateway folder to use.|
|`--jts-exe-name <filename>`|The primary launch filename installed by the TWS software.|
|`--jts-config-dir <path>`|Where TWS reads and stores settings.|
|`--java-home <path>`|The JRE to launch.|
|`--launcher <exe>`|Launch script used to set up the shell environment.|

Commands can also be read from script files, or piped in:

```
printf 'help "Right"\nexit\n' | ib-tws-json -i --no-prompt -p 7496
```

Differences from other TWS API clients
--------------------------------------

This project is not the only TWS API client for Node, and below are some differences.

### Promises

This project uses promises to reject parameter input errors and some I/O errors on the client, and uses the `error` event for errors from the TWS API. This helps to distinguish between client and server errors and makes it easier to associate parameter errors with the calling function.

### Extra properties

This library rejects unknown properties on objects passed into the action methods. So, if you use `conId` when it should be `conid`, the method returns a promise rejected with an assertion error that shows the expected properties.

### conid vs conId

The TWS API Java Client is inconsistent in its use of `conid` vs `conId`, and this project makes no effort to change that.

### ContractDetails.contract

This project follows the Java Client naming of a `contract` property on `ContractDetails`, while other projects may call this property `summary`.

### enums

The Java Client makes use of Java enums, which have both a string and integer representation. This project only recognizes the string representation of the enums, with one exception: `ocaType`.

### ocaType

The TWS API documentation says `ocaType` is a number and that is what this project expects, even though the Java Client supports both int and enum.

### connectAck

`connectAck` is documented as part of the TWS API. While some other clients use `connected`, this project uses `connectAck`.

### disconnected

There is no disconnected event. While the TWS API includes a `connectionClosed` event, this is not actually triggered by the Java Client under normal conditions, and therefore not by this project either. However, an `error` event is fired when the client is disconnected, and the client can call `isConnected` to check connectivity.

### error events

The TWS API reports errors in more than one form: an exception, a plain message, or `(reqId, time, code, msg, advancedOrderRejectJson)`. Clients of this project need to handle all of them, as there is no normalization like in some other projects.

### serverVersion

The `serverVersion` event is triggered by a `serverVersion` action. Other projects might automatically fire a `server` event.

### historicalData

This project follows the TWS API and includes a `Bar` object in `historicalData` events.

### Constants and Helper Utilities

This project does not include any of the constants and helper classes from the TWS sample code, as they are not part of the documented TWS API.

Development
-----------

```
npm install          # downloads lib/ib-tws-json.jar
npm test             # runs the tests with the built-in node:test runner
npm run coverage     # prints a coverage summary and writes coverage/lcov.info
npm run inspect      # runs the tests in-process, paused for a debugger
```

`npm run coverage` and `npm run inspect` use test-runner flags added in Node.js 22.5 and 22.8, so they require Node.js 22.8 or later. `npm test` works on all supported Node.js versions.

`test/ib-tws-node.test.js` runs the Java Client in stand-alone mode, so it needs Java and `TwsApi.jar`, but not a running or logged-in TWS. The other tests use a fake JSON API server and a fake TWS install, and need neither.

The project has no npm dependencies; please keep it that way where practical. See [ARCHITECTURE.md](ARCHITECTURE.md) before making larger changes.

### Updating ib-tws-json

To use a new ib-tws-json release, update the `url` and `sha256` of `lib/ib-tws-json.jar` under `binary-dependencies` in `package.json`. The SHA-256 digest is shown next to the jar on the GitHub release page, or can be computed with `sha256sum`.

License
-------

Copyright (c) 2020-2026 James Leigh.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3 or later. See [LICENSE](LICENSE).
