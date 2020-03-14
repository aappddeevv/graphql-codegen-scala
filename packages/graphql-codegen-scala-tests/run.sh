#!/usr/bin/env sh
export DEBUG=1 
export VERBOSE=1
export DEBUG_DEPTH=10
DEBUG=* npx graphql-codegen -c test.yml
