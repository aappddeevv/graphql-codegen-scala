#!/usr/bin/env sh
export DEBUG=1 
export VERBOSE=1
export DEBUG_DEPTH=10

TFILE=test.yml
if [ $# -gt 0 ]; then
  TFILE="$1"
fi


DEBUG=* npx graphql-codegen -c $TFILE
