#!/bin/bash
npm run compile
npx vsce package --out pbs-workbench.vsix

positron --uninstall-extension eliocamp.pbs-workbench
positron --install-extension pbs-workbench.vsix

code --uninstall-extension eliocamp.pbs-workbench
code --install-extension pbs-workbench.vsix