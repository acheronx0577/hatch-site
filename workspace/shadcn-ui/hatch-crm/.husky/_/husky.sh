#!/usr/bin/env sh

if [ -z "$husky_skip_init" ]; then
  if [ "$HUSKY" = "0" ]; then
    return
  fi

  command -v sh >/dev/null 2>&1 || {
    echo >&2 "husky requires sh"
    exit 1
  }

  if [ "$0" = "/bin/sh" ]; then
    echo >&2 "husky: please set SHELL env variable to a compatible shell."
    exit 1
  fi

  export husky_skip_init=1
  . "$0"
  unset husky_skip_init
fi
