#!/usr/bin/env bash
# Robust launcher: detach the node server into its own session so it survives
# parent/process-group signals. Logs to /tmp/sh-server.log.
cd /opt/data/small-hours || exit 1
pkill -9 -f "node src/server.js" 2>/dev/null
sleep 1
setsid bash -c 'cd /opt/data/small-hours && exec npm start' > /tmp/sh-server.log 2>&1 < /dev/null &
echo "server launched (detached), logging to /tmp/sh-server.log"
sleep 5
curl -s -o /dev/null -w "readiness: localhost:3001/health -> HTTP %{http_code}\n" http://localhost:3001/health
