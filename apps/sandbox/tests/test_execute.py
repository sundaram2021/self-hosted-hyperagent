import os

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def run(language: str, code: str, timeout_ms: int = 15_000) -> dict:
    response = client.post(
        "/execute",
        json={"language": language, "code": code, "timeout_ms": timeout_ms},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_python_stdout() -> None:
    body = run("python", "print(2 + 40)")
    assert body["stdout"].strip() == "42"
    assert body["exit_code"] == 0
    assert body["timed_out"] is False


def test_bash_stdout() -> None:
    body = run("bash", "echo hello-from-bash")
    assert body["stdout"].strip() == "hello-from-bash"
    assert body["exit_code"] == 0


def test_nonzero_exit_code_and_stderr() -> None:
    body = run("python", "import sys; sys.stderr.write('boom\\n'); sys.exit(3)")
    assert body["exit_code"] == 3
    assert "boom" in body["stderr"]


def test_timeout_kills_process() -> None:
    body = run("python", "import time; time.sleep(10)", timeout_ms=500)
    assert body["timed_out"] is True
    assert body["exit_code"] is None
    assert body["duration_ms"] < 5_000


def test_output_truncation() -> None:
    body = run("python", "print('x' * 200_000)")
    assert body["stdout_truncated"] is True
    assert len(body["stdout"]) <= 64 * 1024


def test_environment_is_not_inherited() -> None:
    os.environ["SANDBOX_TEST_SECRET"] = "super-secret-value"
    try:
        body = run("python", "import os; print(sorted(os.environ))")
        assert "SANDBOX_TEST_SECRET" not in body["stdout"]
        assert body["exit_code"] == 0
    finally:
        del os.environ["SANDBOX_TEST_SECRET"]


def test_workdir_is_isolated_and_writable() -> None:
    body = run(
        "python",
        "import os, pathlib\n"
        "pathlib.Path('scratch.txt').write_text('data')\n"
        "print(os.getcwd().startswith('/tmp'))\n"
        "print(os.path.exists('scratch.txt'))",
    )
    assert body["stdout"].splitlines() == ["True", "True"]


def test_request_validation() -> None:
    response = client.post("/execute", json={"language": "cobol", "code": "DISPLAY 1."})
    assert response.status_code == 422
