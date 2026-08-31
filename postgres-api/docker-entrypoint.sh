#!/bin/sh
set -e

npm run migrate:prod

exec "$@"
