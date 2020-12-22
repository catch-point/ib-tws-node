# ib-tws-node
Node client library for for Interactive Broker's Trading Workstation and Gateway

Introduction
------------

The TWS API is a simple yet powerful interface through which Interactive Broker clients can automate their trading strategies, request market data and monitor your account balance and portfolio in real time.

This project uses the official Interactive Broker's Java Client, providing a Node interface bridge. The Java Client and TWS is run in a separate process using the JRE provided with the local TWS installation.

This project differentiates from other client libraries by integrating the TWS Desktop or Gateway into the same JVM running the TWS Java Client. Whereby providing a single interface to control Interactive Broker's Trader Workstation / Gateway from within a NodeJS system.

Requirements
------------

Users must agree to the terms of the Interactive Broker license, download their software and Java Client API.

* The TWS API is an interface to TWS or IB Gateway, and as such requires network connectivity to a running instance of one of these programs. They can be downloaded here: https://www.interactivebrokers.com/en/index.php?f=14099#tws-software
* To obtain the TWS API source and sample code to C:\TWS API or ~/IBJts, download the API Components from here: http://interactivebrokers.github.io
* A working knowledge of the API programming language.
* This project makes use of gradle build tool. See https://gradle.org/

TWS needs to operate in English so that the various dialogues can be recognised. You can set TWS's language by starting it manually (ie without passing a password) and selecting the language on the initial login dialog. TWS will remember this language setting when you subsequently use it.

Note that you do not need an IBKR account to try this out, as you can use IBKR's Free Trial offer, for which there is a link at the top of the homepage on their website.

API Client
----------

A unique feature of ib-tws-node is the ability to manage TWS` GUI, including logging in, enabling API, and dismissing common dialogues. However, ib-tws-node can be used without TWS, but it still needs TwsApi.jar!

The client makes heavy use of promises *and* events. Every method returns a promise to validate the input before passing it along to TWS, even though none of the methods return anything useful in those promises. All responses are found in events on the client.

Methods on the client can also vary slightly depending on the version the the TWS API available. Use the `help "EClient"` and `help "Shell"` commands in the shell to list available methods, or simply go straight to the documentation here: https://interactivebrokers.github.io/tws-api/classIBApi_1_1EClient.html

Events from the client can also be listed using the `help "EWrapper"` command and documented here: https://interactivebrokers.github.io/tws-api/interfaceIBApi_1_1EWrapper.html

Below is an example of using TWS with ib-tws-node, where TWS is installed in the default location and TWS API is installed in `~/IBJts`.

```
const Client = require('ib-tws-node');

const client = await Client({silence: false});

client.on('error', console.error);
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

await client.exit();
```

Shell
-----

This library uses the ib-tws-shell and includes a `ib-tws-shell` script that can be used to learn more about the API. A particularly useful command in the `help` command that can be combined with a method name or type to print out the parameters or property available. For example if you cannot remember if it's `conid` or `conId`, use the shell to quickly find out. However, the client would reject a promise if you get the properties wrong anyway.

```
$ ib-tws-shell
Welcome to ib-tws-shell! Type 'help' to see a list of commands or 'login' to open TWS.
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
All the methods available on the ib-tws-node client are also available from the ib-tws-shell. Making it a useful tool to try things out in TWS before committing it in code.

Below we quickly confirm that `REL` orders are not supported on the TSE exchange.

```
$ ib-tws-shell --silence
> login
login	"TWO_FA_IN_PROGRESS"
login	"LOGGED_IN"
> enableAPI 7496 false
enableAPI	7496
> eConnect "localhost" 7496 0 false
connectAck
managedAccounts	"U112233"
nextValidId	1
error	-1	2104	"Market data farm connection is OK:usfarm.nj"
error	-1	2104	"Market data farm connection is OK:cashfarm"
error	-1	2104	"Market data farm connection is OK:cafarm"
error	-1	2104	"Market data farm connection is OK:usfarm"
error	-1	2106	"HMDS data farm connection is OK:ushmds"
error	-1	2158	"Sec-def data farm connection is OK:secdefnj"
> placeOrder 1 {
...   "symbol":"SHOP","exchange": "TSE","currency":"CAD","secType":"STK"
... } {
...   "action":"BUY","totalQuantity":1,"orderType":"REL"
... }
error	1	387	"Unsupported order type for this exchange and security type."
> exit
error	"Socket closed"
```

API Guide
---------

### Client

The ib-tws-node module exports a factory function to create a new client. It takes the following options.

| Parameter Name | Parameter Value |
|----------------|-----------------|
|java|The java executable that is used to launch ib-tws-shell. If none is provided, it uses the JRE that will be used to launch TWS.|
|java-home|The JRE that is used to launch TWS. If none is provided, an install4j JRE is searched for in the tws-path that would have been installed by TWS. Note that TWS cannot be run with just any JRE and depends on features provided with the JRE that came with the install.|
|tws-api-jar|Points to the TwsApi.jar file that should be used when connecting to TWS. If none is provide it is searched for using tws-api-path.|
|tws-api-path|Where to look for the TwsApi.jar file (if tws-api-jar is not provided). If not provided, it will look in C:\\TWS API, ~/IBJts, and a few other places.|
|tws-path|The install location of TWS Desktop or Gateway. If using an offline version (or Gateway) this can point to the folder with the version number. When not provided, the system will look in the default location for Gateway and (if not found) TWS Desktop.|
|tws-settings-path|Every running instance must have a unique tws-settings-path, which defaults to `~/Jts`.|
|tws-version|If the tws-path is not provided this can help choose which TWS instance to launch. It is recommended to use an offline TWS install to give project contributors time to test new TWS releases.|
|silence|Don't log anything, just report API responses.|


#### help

The command `help "Shell"` and `help "EClient"` ilst available commands in a `help` response. Other parameters string can be given to provide the schema available for those methods or types. `helpEnd` is sent it indicate the response is complete.

`help "EWrapper"` list the events sent from the shell based an activity in TWS.

#### login

This opens the TWS (or Gateway) software and logins into the application.

The first parameter must be "live" or "paper", the second provides the credentials in Base64 UTF-8 encoding. It has the following base64 UTF-8 string properties.

* FIXBase64UserName
* FIXBase64Password
* IBAPIBase64UserName
* IBAPIBase64Password

The third parameter to login is a JSON object with the properties from the table below.

| Property | Description |
| -------- | ------------|
|AcceptIncomingConnectionAction|Only needed if TWS is on a different server. The default value of "manual" means that the user must explicitly configure IBC to automatically accept API connections from unknown computers, but it is safest to set this to "reject" and to explicitly configure TWS to specify which IP addresses are allowed to connnect to the API.|
|AcceptNonBrokerageAccountWarning|If set to false, the user must manually accept this warning.|
|AllowBlindTrading|Unless this is set to true, attempts to place an order for a contract for which the account has no market data subscription, the user must manually accept a dialog warning against such blind trading.|
|DismissNSEComplianceNotice|If set to false, the user must manually dismiss this warning.|
|ExistingSessionDetectedAction| When a user logs on to an IBKR account for trading purposes by any means, the IBKR account server checks to see whether the account is already logged in elsewhere. If so, a dialog is displayed to both the users that enables them to determine what happens next. Read on below to see how this setting instructs TWS how to proceed.|
|FIX|Set to true if TWS should authenticate with Financial Information Exchange (FIX) protocol.|
|LogComponents|Use to identify window names that are opened by TWS. Can be "activate", "open", "openclose", or "never".|
|MinimizeMainWindow|Set to true to minimize TWS when it starts.|
|ReadOnlyLogin|If ReadOnlyLogin is set to true, and the user is enrolled in IB's account security programme, the user will not be asked to supply the security code, and login to TWS will occur automatically in read-only mode: in this mode, placing or managing orders is not allowed. Otherwise, if the user is enrolled in IB's account security programme, the user must supply the relevant security code to complete the login. If the user is not enrolled in IB's account security programme, this setting is ignored.|
|StoreSettingsOnServer|Set this to true to store a copy of the TWS settings on IB's servers as well as locally on your computer.  This enables you to run TWS on different computers with the same configuration, market data lines, etc.  Otherwise, running TWS on different computers will not share the same settings.|
|SuppressInfoMessages|Set to false to log more intermediate information about window states.|

##### ExistingSessionDetectedAction

When a user logs on to an IBKR account for trading purposes by any means, the
IBKR account server checks to see whether the account is already logged in
elsewhere. If so, a dialog is displayed to both the users that enables them
to determine what happens next. The `ExistingSessionDetectedAction` setting
instructs TWS how to proceed when it displays one of these dialogs:

  * If the existing TWS session is set to 'primary', the existing session
    continues and the new session is not permitted to proceed.

  * If the existing TWS session is set to 'primaryoverride', the existing
    session terminates and the new session is permitted to proceed.

  * If the new session is via TWS with
    `ExistingSessionDetectedAction=secondary', the new TWS exits so that the
    existing session is unaffected.

  * If the existing TWS session is set to 'manual', the user must handle the
    dialog.

The difference between `primary` and `primaryoverride` is that a
`primaryoverride` session can be taken over by a new `primary` or
`primaryoverride` session, but a `primary` session cannot be taken over by
any other session.

When set to 'primary', if another TWS session is started and manually told to
end the `primary` session, the `primary` session is automatically reconnected.

The default is 'manual'.

During a normal login process a "login" response is ussed with "TWO_FA_IN_PROGRESS" and later with "LOGGED_IN".

#### enableAPI

Open the Configuration dialogue and enables the API. The first parameter is the port number to listen on, the second parameter is true if the conneciton should be read-only, false otherwise. An "enableAPI" response is issued with the currently configured port number. However, TWS may need a little more time before it will be listening on the given port.

#### saveSettings

Saves the current settings.

#### sleep

Causes the shell to pause the given number of milliseconds before processing the next command.

#### reconnectData

Presses the Reconnect Date button in TWS.

#### reconnectAccount

Issues Ctl-Alt-R to TWS to recennect to the servers.

#### eConnect

This can be used with or without logging in to TWS (if another TWS instance is running). The parameters are as follows.

* host
* port number
* true for extra authentication, false for normal authentication

#### eDisconnect

Disconnect the client API. This can be used to change clientId by calling eConnect afterwards.

#### exit

Close everything down and exit the shell

#### serverVersion

Issue a "serverVersion" response with the Host's version. Some of the API functionality might not be available in older Hosts and therefore it is essential to keep the TWS/Gateway and TWS API up to date.

#### isConnected

Issue a "isConnected" response.

#### connectedHost

Issue a "connectedHost" response.

#### isUseV100Plus

Issue a "isUseV100Plus" response, which is enabled by default.

#### optionalCapabilities

Provide a string value recognized by the API or issues a "optionalCapabilities" response of those values.

#### faMsgTypeName

Issue a "faMsgTypeName" response converting 1, 2, or 3 into "GROUPS", "PROFILES", and "ALIASES" respectively.

#### getTwsConnectionTime

Issue a "getTwsConnectionTime" response with the time the connection was established.

Alternatives
------------

This project is not the only TWS API client for node and below are some differences.

### TWS GUI

This project has an expanded scope that include managing areas of the TWS software that are not included in the TWS API. This make this client particularly useful for deployments to a headless server or an automated trading system. Included in this project is the ability to (among other things):

* It can be initiate TWS or Gateway to startup or shutdown;
* Automatically fill in your username and password and click the Login button in the Login dialogue;
* Ensure attempts to logon from another computer or device do not succeed;
* Participate in Two Factor Authentication using IBKR Mobile in such a way that users who miss the 2FA alert on their device will automatically have another opportunity without needing be at the computer;
* Handle various dialogue boxes, to keep things running smoothly with no user involvement;

### Promises

This project uses promises to reject parameter input errors and some i/o errors, while server errors use the `error` event. This helps to distinguish between client and server errors and make it easier to associate parameter errors with calling function.

### ContractDetails.contract

This project follows the Java Client naming of a `contract` property on `ContractDetails`, while other projects may call this project 'summary'.

### conid vs conId

The Java Client is inconsistent of its use of `conid` vs `conId`, this project makes no effort to change that. However, other node clients do.

### connectAck

The `connectAck` is documented as part of TWS API, even though some other clients use 'connected'.

### disconnected

There is no disconnected event. While TWS API includes a `connectionClosed` event, this not actually triggered in the Java Client under normal situations and therefore neither in this project. However, an `error` event is fired when the client is disconnected and the client can issue a `isConnected` action to check connectivity.

### error events

The TWS API defines three formats of error events: Exception, string or id/code/msg. Clients of this project will need to handle all three and there is no normalization as there are in other projects.

### serverVersion

`serverVersion` event trigger from a `serverVersion` action. Other projects might automatically fire a 'server' event.

### historicalData

Note that this project follows the TWS API and includes a `Bar` in `historicalData` events.

### Constants and Helper Utilities

This project does not include any of the Constants and Helper Classes from the TWS sample code as they are not included in the documented TWS API.








