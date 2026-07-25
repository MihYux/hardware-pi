import importlib.util
from pathlib import Path


def test_command_line_configuration_writes_provider_keys(
    tmp_path: Path,
    monkeypatch,
):
    script = (
        Path(__file__).resolve().parents[2]
        / "deploy"
        / "configure.py"
    )
    spec = importlib.util.spec_from_file_location(
        "hardware_pi_configure",
        script,
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    environment = tmp_path / ".env"
    environment.write_text(
        "DEEPSEEK_API_KEY=\n"
        "ZHIPU_API_KEY=existing-zhipu\n"
        "DASHSCOPE_API_KEY=\n",
        encoding="utf-8",
    )
    answers = iter(
        ["deepseek-from-cli", "", "dashscope-from-cli"]
    )
    monkeypatch.setattr(
        module.getpass,
        "getpass",
        lambda _prompt: next(answers),
    )

    module.configure(environment)
    values = module.read_values(
        environment.read_text(encoding="utf-8").splitlines()
    )

    assert values["DEEPSEEK_API_KEY"] == "deepseek-from-cli"
    assert values["ZHIPU_API_KEY"] == "existing-zhipu"
    assert values["DASHSCOPE_API_KEY"] == "dashscope-from-cli"
