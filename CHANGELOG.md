# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.2] - 2026-11-04

### Changed
- Updated ib-tws-json from 2.1.0 to 2.1.1. Installing the extension or
  launching TWS now finds TWS, IB Gateway and `TwsApi.jar` in the default
  folders used by IBKR's current installers. See the
  [ib-tws-json changelog](https://github.com/catch-point/ib-tws-json/blob/develop/CHANGELOG.md#211)
  for details.

### Fixed
- `TwsApi.jar` and the TWS bundled JRE are found in the default folders of
  IBKR's current installers: `TwsApi.jar` in `C:\TWS API <version>`,
  `~/Applications/TWS API <version>`, `~/TWS API <version>` and `~/tws-api`
  (unattended install), and the JRE in `~/tws` and `~/ibgateway` (unattended
  install). Previously only the unversioned `C:\TWS API` folder and `~/Jts`
  were searched, so unattended installs on headless servers fell back to
  `JAVA_HOME` and needed `twsApiJar` or `twsApiPath`.

## [2.1.1] - 2026-11-04

### Added
- Regression tests for deriving the JSON API port when `twsApiPort` is
  provided as a string, for rejecting non-boolean values, for the
  `JAVA_HOME` fallback, and for a launcher that cannot be started.

### Fixed
- A string `twsApiPort` was concatenated with the port offset, producing an
  invalid JSON API port (for example `1007496` instead of `7596`). A string
  `timeout` had the same kind of problem when waiting for a launched TWS.
- Child process stderr was written to `process.stderr` and also passed to
  `Client.logger`, producing duplicate output and bypassing a custom logger.
- Boolean parameters accepted `0` and `""` as valid values.
- `kill(signal)` ignored the signal, and `launchTws` did not wait for the
  launcher process to exit.
- JRE discovery did not fall back to `JAVA_HOME` when an install4j directory
  was found but no usable JRE was located inside it.
- If the launcher process could not be started while launching TWS (for
  example, a missing `launcher` executable), the unhandled child process
  `error` event crashed the Node process. The client factory now rejects with
  a "could not launch IBKR TWS" error.

### Changed
- The factory exported by `src/ib-tws-json.js` no longer pipes the Java
  process's stderr to `process.stderr`. Code that imports it directly must
  read `stderr` itself (as the client does, through `Client.logger`), or the
  Java process may block once the stderr pipe buffer fills.
- README error examples ignore informational farm messages (2104, 2106 and
  2158) instead of aborting on every `error` event. The install example now
  pins v2.1.1, and the development section notes that `coverage` and
  `inspect` require Node.js 22.8 or later.

## [2.1.0] - 2026-11-04

### Added
- `ARCHITECTURE.md`, describing the components, connection modes, wire
  protocol, runtime schema and design constraints.
- README sections on installation, command-line options, client members,
  development and the license.

### Changed
- Converted the project from CommonJS to ES modules (`"type": "module"`).
  Use `import Client from 'ib-tws-node'`. `require('ib-tws-node')` still
  returns the client factory function on Node versions that can `require()`
  ES modules.
- Requires Node.js 20.19 or later, or 22.12 or later (previously 20.0).
- `logger` is now a property of the exported factory function. Set
  `Client.logger` instead of reassigning the module's `logger` export.
  `require('ib-tws-node').logger = ...` continues to work.
- Code that loads files inside the package directly, such as
  `src/ib-tws-json.js`, receives an ES module; its factory is the
  `default` export.
- README updated for ES modules, with corrected and newly documented client
  settings (`jsonApiHost`, `jsonApiInet`, `timeout`, `noLaunch`).
- `.gitignore` trimmed to the files this project produces, including the TWS
  settings written when the project folder is used as `jtsConfigDir`.

## [2.0.1] - 2026-11-04

### Fixed
- Response lines split across two chunks of socket or process output were
  corrupted (the literal text `buffer` replaced the start of the line), so the
  event was lost or emitted under the wrong name. Large responses were most
  affected.
- The `jts-install-dir` setting (`jtsInstallDir`, `--jts-install-dir`) is now
  searched for the JRE bundled with TWS. It was still reading the `tws-path`
  setting that was renamed in 0.1.1, so only the default install locations
  were searched.

## [2.0.0] - 2026-11-04

### Changed
- **Breaking:** Requires Node.js 20 or later (declared in `engines`).
- **Breaking:** `binary-dependencies` entries in `package.json` are now objects
  with a `url` and a `sha256` checksum instead of a plain URL string.
- **Breaking:** Installation now fails if a binary dependency cannot be
  downloaded (non-200 HTTP status, too many redirects) or its SHA-256 checksum
  does not match. Previously an error page could be silently saved as the jar.
- Updated ib-tws-json from 1.1.1 to 2.1.0. TWS API commands, events and types
  still come from the installed `TwsApi.jar` at runtime, so TWS API changes
  depend on the TWS API version installed rather than on this release. See the
  [ib-tws-json changelog](https://github.com/catch-point/ib-tws-json/blob/develop/CHANGELOG.md) for the changes in each TWS API version.
- `help` for an overloaded name now always describes the same version (the one
  with the most parameters, preferring enum parameters): `help "requestFA"`
  shows `FADataType`, and `help "error"` shows
  `error(int, long, int, String, String)`.
- ib-tws-json 2.1.0 accepts numeric enum codes and every version of an
  overloaded command, but this client still validates each call against the
  version `help` describes and accepts enum names only. For example,
  `requestFA(1)` is rejected; use `requestFA('GROUPS')`.
- The `ib-tws-json` command line is parsed with Node's built-in `util.parseArgs`
  instead of `commander`. Options and their behaviour are unchanged; help text
  is no longer wrapped to the terminal width.
- Tests run with the built-in `node:test` runner instead of Jest.
  `npm run coverage` writes `coverage/lcov.info` instead of an HTML report.

### Fixed
- `reqWshEventData` can be used. Its `WshEventData` parameter accepts `conId`
  or `filter`, plus `fillWatchlist`, `fillPortfolio`, `fillCompetitors`,
  `startDate`, `endDate` and `totalLimit`, and `help "WshEventData"` lists
  them. Previously the call always failed.
- The postinstall script skips the download when the existing jar already
  matches its checksum, and writes downloads to a temporary file so a failed
  download never leaves a partial jar behind.
- The `requestFA('GROUPS')` and `requestFA('ALIASES')` tests now actually await
  the call; previously they could never fail.

### Removed
- The TWS API's `*ProtoBuf` commands and events (such as `placeOrderProtoBuf`)
  are no longer offered when the installed TWS API has them. They could not be
  used from JSON.
- All npm dependencies: `commander` (runtime) and `jest` (development).
  This removes all 17 vulnerabilities previously reported by `npm audit`.

## [1.1.1] - 2026-01-18

### Added
- Tests for `error` events and `requestFA` parameter validation.

### Changed
- Documentation and examples updated for the `error` event signature
  `(reqId, time, code, msg, advancedOrderRejectJson)`.

## [1.1.0] - 2026-01-02

### Changed
- Updated ib-tws-json from 1.0.0 to 1.1.1, which is built for TWS API 10.37.
  TWS API 10.37 changed several signatures from 10.19, including the `error`
  event, now `(reqId, time, code, msg, advancedOrderRejectJson)`, as well as
  `cancelOrder`, `reqGlobalCancel`, `exerciseOptions`, `orderStatus` (`permId`
  is now a string) and `commissionReport` (renamed `commissionAndFeesReport`).
  See [ib-tws-json 1.0.1](https://github.com/catch-point/ib-tws-json/blob/develop/CHANGELOG.md#101) for details. This client rejects calls that
  use the old number of arguments or removed properties (such as
  `Order.faProfile`) before they are sent.
- Project moved from `jamesrdf` to the `catch-point` GitHub organization.

### Removed
- `faMsgTypeName`, ib-tws-json's own command and event (removed in
  ib-tws-json 1.0.1).

## [1.0.0] - 2023-11-03

### Changed
- Updated ib-tws-json to 1.0.0.
- Use exponential back-off while waiting for TWS to start.

## [0.1.6] - 2023-02-06

### Added
- `logger` export (defaults to `console`) to redirect output from the Java
  process.

### Changed
- More specific error messages when TWS cannot be launched or the JSON API
  cannot be reached.

## [0.1.5] - 2023-01-30

### Fixed
- The `env` setting is now passed to the JVM.

## [0.1.4] - 2023-01-30

### Fixed
- Detect a destroyed socket or killed process before sending commands.

## [0.1.3] - 2023-01-27

### Changed
- **Breaking:** Client settings use camelCase (`twsApiPort`, `twsApiHost`,
  `jsonApiPort`, `jtsInstallDir`, `javaHome`, …).
- **Breaking:** Command-line options renamed to `--tws-api-host`,
  `--tws-api-port`, `--json-api-port`, `--json-api-port-offset` and
  `--json-api-inet`. The `-I` short option for `--no-prompt` was removed.
- Updated ib-tws-json to 0.1.3.

## [0.1.2] - 2023-01-26

### Added
- Documented the three modes of operation: TWS JSON extension installed,
  external JVM, or launching TWS with the extension.

### Changed
- `no-prompt` must now be set explicitly by the caller.
- Setting a non-local `tws-host` prevents launching a local TWS.
- Updated ib-tws-json to 0.1.2.

## [0.1.1] - 2023-01-25

### Changed
- **Breaking:** Replaced ib-tws-shell with ib-tws-json. The bundled script is
  now `ib-tws-json` and TWS is connected to through its JSON API extension,
  with manual login.
- **Breaking:** New settings `tws-host`, `tws-port`, `json-host`, `json-port`,
  `json-port-offset`, `jts-install-dir`, `jts-exe-name` and `jts-config-dir`
  replace `tws-path`, `tws-settings-path`, `tws-version` and `silence`.

### Removed
- Automated TWS login, API enabling and dialog handling (the `login` and
  `enableAPI` commands).

## [0.0.15] - 2022-11-08

### Changed
- Updated ib-tws-shell to 0.0.9.
- More lenient parsing of shell output.
- Discovered `java-home`, `tws-path`, `tws-version` and `tws-api-jar` values are
  logged unless `silence` is set.

## [0.0.14] - 2021-04-16

### Changed
- Parameter errors include the values that were passed.

## [0.0.13] - 2021-03-12

### Changed
- Methods called after the shell has exited reject their promises instead of
  emitting `error` events. `isConnected` emits `false` and `exit` resolves.

## [0.0.12] - 2021-03-10

### Fixed
- Fail when ib-tws-shell does not start at all.

## [0.0.11] - 2021-03-10

### Fixed
- Fail when ib-tws-shell exits during startup.

## [0.0.10] - 2021-02-22

### Fixed
- `isConnected` emits `false` immediately after the shell disconnects.

## [0.0.9] - 2021-01-25

### Fixed
- Errors on the shell's stdin, stdout and stderr streams are passed to the
  caller as `error` events.

## [0.0.8] - 2021-01-09

### Changed
- Sources moved to `src/`.
- Updated ib-tws-shell to 0.0.8.

## [0.0.7] - 2020-12-30

### Added
- `launcher` setting to run a script that sets up the environment before
  launching the shell.
- `env` setting for environment variables.

### Removed
- The `java` setting (use `launcher` instead).

## [0.0.6] - 2020-12-22

### Changed
- `ocaType` is an integer, as per the TWS API documentation.

## [0.0.5] - 2020-12-22

### Fixed
- `null` parameter values are no longer validated.

## [0.0.4] - 2020-12-22

### Changed
- Unknown settings are ignored.

## [0.0.3] - 2020-12-20

### Changed
- Action types are read from the help schema.

## [0.0.2] - 2020-12-19

### Added
- `java` setting to override the JRE used to launch the shell.

## [0.0.1] - 2020-12-17

### Added
- Initial Node.js client library for ib-tws-shell.

[2.1.2]: https://github.com/catch-point/ib-tws-node/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/catch-point/ib-tws-node/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/catch-point/ib-tws-node/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/catch-point/ib-tws-node/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/catch-point/ib-tws-node/compare/2fcfe91...v2.0.0
[1.1.1]: https://github.com/catch-point/ib-tws-node/compare/ec62e02...2fcfe91
[1.1.0]: https://github.com/catch-point/ib-tws-node/compare/42361fb...ec62e02
[1.0.0]: https://github.com/catch-point/ib-tws-node/compare/223693f...42361fb
[0.1.6]: https://github.com/catch-point/ib-tws-node/compare/d7dc816...223693f
[0.1.5]: https://github.com/catch-point/ib-tws-node/compare/a1f14a7...d7dc816
[0.1.4]: https://github.com/catch-point/ib-tws-node/compare/97e401b...a1f14a7
[0.1.3]: https://github.com/catch-point/ib-tws-node/compare/105a12d...97e401b
[0.1.2]: https://github.com/catch-point/ib-tws-node/compare/3ad7a6a...105a12d
[0.1.1]: https://github.com/catch-point/ib-tws-node/compare/a33f6a5...3ad7a6a
[0.0.15]: https://github.com/catch-point/ib-tws-node/compare/c4eba73...a33f6a5
[0.0.14]: https://github.com/catch-point/ib-tws-node/compare/0.0.13...c4eba73
[0.0.13]: https://github.com/catch-point/ib-tws-node/compare/0.0.12...0.0.13
[0.0.12]: https://github.com/catch-point/ib-tws-node/compare/abd36a9...0.0.12
[0.0.11]: https://github.com/catch-point/ib-tws-node/compare/0.0.10...abd36a9
[0.0.10]: https://github.com/catch-point/ib-tws-node/compare/0.0.9...0.0.10
[0.0.9]: https://github.com/catch-point/ib-tws-node/compare/0.0.8...0.0.9
[0.0.8]: https://github.com/catch-point/ib-tws-node/compare/0.0.7...0.0.8
[0.0.7]: https://github.com/catch-point/ib-tws-node/compare/0.0.6...0.0.7
[0.0.6]: https://github.com/catch-point/ib-tws-node/compare/0.0.5...0.0.6
[0.0.5]: https://github.com/catch-point/ib-tws-node/compare/0.0.4...0.0.5
[0.0.4]: https://github.com/catch-point/ib-tws-node/compare/ed81c34...0.0.4
[0.0.3]: https://github.com/catch-point/ib-tws-node/compare/ba915b6...ed81c34
[0.0.2]: https://github.com/catch-point/ib-tws-node/compare/70a4f43...ba915b6
[0.0.1]: https://github.com/catch-point/ib-tws-node/tree/70a4f43
