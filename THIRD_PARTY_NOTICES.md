# Third-party notices

## Satoshi fonts

Satoshi is distributed by Indian Type Foundry through [Fontshare](https://www.fontshare.com/fonts/satoshi) under the [ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl). The license permits end-user self-hosting for their own websites and applications and restricts redistribution of the font software through repositories.

Font binaries are therefore excluded from this repository. `npm run setup:fonts` downloads the official archive directly from Fontshare and installs the three files required by the interface and link-preview renderer. Review Fontshare's terms before running setup. Generated font files and the local license copy are ignored by Git.

The setup script checks the extracted font files against pinned SHA-256 hashes. If Fontshare changes its distribution, setup fails rather than silently installing different files. Review the new official archive and its license before updating those hashes.

## npm dependencies

Dependencies and exact resolved versions are recorded in `package-lock.json`. Their copyright and license terms remain with their respective authors and are included in the installed packages.

## Branding and media

T-minus names, marks and bundled marketing media are project assets. Publishing the source does not grant trademark rights or imply that forks are official T-minus deployments. The X logo remains the property of its owner.
