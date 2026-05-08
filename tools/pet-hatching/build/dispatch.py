#!/usr/bin/env python3
"""
Dispatch script for pet-hatching sidecar.
Invokes the appropriate hatching script based on --cmd argument.
"""

import argparse
import sys
from pathlib import Path

# Try to add scripts directory to path (for dev mode)
# In bundled mode, scripts are available via the PyInstaller datas mechanism
scripts_dir = Path(__file__).parent.parent / "scripts"
if scripts_dir.exists():
    sys.path.insert(0, str(scripts_dir))


def main() -> None:
    parser = argparse.ArgumentParser(description="Pet hatching sidecar dispatcher")
    parser.add_argument("--cmd", required=True, choices=["compose", "validate", "mirror", "package"])
    parser.add_argument("--workspace", type=str)

    # Forward all remaining arguments to the subcommand
    args, remaining = parser.parse_known_args()

    if args.cmd == "compose":
        from compose_atlas import main as compose_main
        sys.argv = ["compose_atlas.py"] + remaining
        compose_main()
    elif args.cmd == "validate":
        from validate_atlas import main as validate_main
        sys.argv = ["validate_atlas.py"] + remaining
        validate_main()
    elif args.cmd == "mirror":
        from derive_running_left_from_running_right import main as mirror_main
        sys.argv = ["derive_running_left_from_running_right.py"] + remaining
        mirror_main()
    elif args.cmd == "package":
        from package_custom_pet import main as package_main
        sys.argv = ["package_custom_pet.py"] + remaining
        package_main()


if __name__ == "__main__":
    main()