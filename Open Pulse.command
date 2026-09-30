#!/bin/sh
# Run the launcher through sh so it works even if a zip tool dropped the
# executable bit, and so macOS only asks to approve this one file.
exec /bin/sh "$(dirname "$0")/scripts/start-mac.command"
