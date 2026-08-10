#!/bin/sh
case "$1" in
  *sername*) printf '%s\n' "${VIBERANT_GITHUB_USER}" ;;
  *) printf '%s\n' "${VIBERANT_GITHUB_TOKEN}" ;;
esac
