#!/bin/bash
# Workaround for buggy behavior
# Change '### [' to '## ['
DIR="./"
sed -r -e 's/^#{1,3} \[/## [/' -i $DIR/CHANGELOG.md
