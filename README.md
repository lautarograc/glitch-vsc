# glitch-vsc README

A api-wrapper extension for GlitchTip error monitoring platform in Visual Studio Code and Cursor

## Features

- View GlitchTip issues directly in your code editor as hover tooltips

- Auto-refresh issues every hour

- Setup wizard to configure your GlitchTip project

- Integrated with ruby stack tracing

## Requirements

- A GlitchTip account and project

## Extension Settings

* `glitchTip.apiUrl`: The base URL of your GlitchTip instance (e.g., `https://glitchtip.example.com`).
* `glitchTip.projectId`: The ID of your GlitchTip project.
* `glitchTip.authToken`: Your GlitchTip API authentication token.

## Known Issues

- Issues with file path mappings may occur with some dependencies / stack traces.
- Limited support for non-ruby projects.
- open in browser not supported. Glitctip is not yet 100% compliant with Sentry API, so some features in glitchtip are not yet implemented, this is independent of this extension.


## Release Notes

First version released

### 1.0.0

Initial release of extension.
