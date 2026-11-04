# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Updated ib-tws-json to 2.1.0.
- The `ib-tws-json` command line is parsed with Node's built-in `util.parseArgs`
  instead of `commander`. Options and their behaviour are unchanged; help text
  is no longer wrapped to the terminal width.
- Tests run with the built-in `node:test` runner instead of Jest.
  `npm run coverage` writes `coverage/lcov.info` instead of an HTML report.

### Fixed
- The postinstall script skips the download when the existing jar already
  matches its checksum, and writes downloads to a temporary file so a failed
  download never leaves a partial jar behind.
- The `requestFA('GROUPS')` and `requestFA('ALIASES')` tests now actually await
  the call; previously they could never fail.

### Removed
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
- Updated ib-tws-json to 1.1.1, which uses the newer TWS API `error` event
  signature `(reqId, time, code, msg, advancedOrderRejectJson)`.
- Project moved from `jamesrdf` to the `catch-point` GitHub organization.

### Removed
- `faMsgTypeName`, which is no longer part of the TWS API.

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

[2.0.1]: https://github.com/catch-point/ib-tws-node/compare/7d83a79...HEAD
[2.0.0]: https://github.com/catch-point/ib-tws-node/compare/2fcfe91...7d83a79
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
