#!/bin/bash
npm run compile
npx vsce package --out pbs-workbench.vsix

positron --install-extension pbs-workbench.vsix --force

code --install-extension pbs-workbench.vsix --force