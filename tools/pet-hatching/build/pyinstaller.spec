# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for pet-hatching sidecar.
Bundles four hatching scripts into a single binary with command dispatch.
"""

block_cipher = None

a = Analysis(
    ["dispatch.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("../scripts", "scripts"),
    ],
    hiddenimports=[
        "PIL.Image",
        "PIL.ImageFile",
        "PIL.ImageOps",
        "PIL.JpegImagePlugin",
        "PIL.PngImagePlugin",
        "PIL.WebPImagePlugin",
        "PIL._tkinter_finder",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="pet-hatching",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
