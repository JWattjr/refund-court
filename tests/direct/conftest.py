"""Shared helpers and a Windows compatibility shim for direct-mode tests."""

import os
import tempfile

from gltest.direct import loader
from gltest.direct.vm import VMContext


def _windows_safe_message_injection(vm):
    """Keep direct-test stdin temp files until their Windows handles close.

    genlayer-testing-suite's loader deletes its temporary stdin file immediately
    after duplicating its file descriptor. POSIX permits that pattern; Windows
    raises ``WinError 32`` while descriptor 0 is still open. Deferred cleanup
    faithfully preserves the harness behavior without touching contract code.
    """

    try:
        from genlayer.py import calldata
        from genlayer.py.types import Address
    except ImportError:
        return

    sender_address = vm.sender
    if isinstance(sender_address, bytes):
        sender_address = Address(sender_address)
    contract_address = vm._contract_address
    if isinstance(contract_address, bytes):
        contract_address = Address(contract_address)
    origin_address = vm.origin
    if isinstance(origin_address, bytes):
        origin_address = Address(origin_address)

    message_data = {
        "contract_address": contract_address,
        "sender_address": sender_address,
        "origin_address": origin_address,
        "stack": [],
        "value": vm._value,
        "datetime": vm._datetime,
        "is_init": False,
        "chain_id": vm._chain_id,
        "entry_kind": 0,
        "entry_data": b"",
        "entry_stage_data": None,
    }
    fd, path = tempfile.mkstemp()
    try:
        os.write(fd, calldata.encode(message_data))
        os.lseek(fd, 0, os.SEEK_SET)
        vm._original_stdin_fd = os.dup(0)
        os.dup2(fd, 0)
        paths = getattr(vm, "_covenant_temp_message_paths", [])
        paths.append(path)
        vm._covenant_temp_message_paths = paths
    finally:
        os.close(fd)


_original_cleanup = VMContext._cleanup_after_deactivate


def _cleanup_with_deferred_temp_files(vm):
    _original_cleanup(vm)
    for path in getattr(vm, "_covenant_temp_message_paths", []):
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
    vm._covenant_temp_message_paths = []


loader._inject_message_to_fd0 = _windows_safe_message_injection
VMContext._cleanup_after_deactivate = _cleanup_with_deferred_temp_files


def to_hex(address):
    """Convert a direct-test address into the checksummed view representation."""

    if hasattr(address, "as_hex"):
        return address.as_hex
    from genlayer.py.types import Address

    return Address(address).as_hex


def as_address(address):
    """Encode direct fixture bytes as the SDK's Address argument type."""

    if hasattr(address, "as_hex"):
        return address
    from genlayer.py.types import Address

    return Address(address)
