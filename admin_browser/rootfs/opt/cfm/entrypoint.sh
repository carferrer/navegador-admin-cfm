#!/bin/sh
set -eu
umask 077
node /opt/cfm/configure.mjs
# This file contains only validated numeric/boolean values generated locally.
. /run/cfm-env
# No Supervisor credentials in browser/service environments.
unset SUPERVISOR_TOKEN HASSIO_TOKEN
# Inherited by the supervisor and all services; setuid/file capabilities cannot
# grant new privileges through exec, while root can still perform initial setup.
exec /opt/cfm/secure-launch /init
