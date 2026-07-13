import os
from typing import Optional


def greet(name: str, excited: bool = False) -> str:
    # TODO: support i18n
    suffix = "!" if excited else "."
    return f"Hello, {name}{suffix}"


class Greeter:
    def __init__(self, default_name: str):
        self.default_name = default_name

    def greet_default(self) -> str:
        # FIXME: this ignores excited
        return greet(self.default_name)
